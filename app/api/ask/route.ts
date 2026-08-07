import { z } from "zod";

import { handler, ok, parseBody } from "@/lib/api";
import {
  buildContext,
  estimateCostUsd,
  synthesizeAnswer,
} from "@/lib/fireworks";
import { queryHydra } from "@/lib/hydradb";
import { recordMetric } from "@/lib/metrics-store";
import {
  classifyQueryComplexity,
  collectionsForQuestion,
} from "@/lib/query-router";
import type { AnswerSource, AskAnswer } from "@/lib/types";

export const dynamic = "force-dynamic";

const askSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "question is too short")
    .max(2000, "question is too long"),
  /** Overrides the router — used to demonstrate the fast/thinking tradeoff. */
  forceMode: z.enum(["fast", "thinking"]).optional(),
});

/**
 * The core Q&A path:
 *
 *   classify → retrieve from HydraDB → synthesize with Fireworks → log → return
 *
 * Timings are captured per stage so the UI can show where latency actually
 * went, rather than one opaque total.
 */
export async function POST(request: Request) {
  return handler(async () => {
    const parsed = await parseBody(request, askSchema);
    if (!parsed.ok) return parsed.response;

    const { question, forceMode } = parsed.data;
    const started = Date.now();

    // 1. Route before touching HydraDB, so the decision is ours and reportable.
    const decision = classifyQueryComplexity(question);
    const mode = forceMode ?? decision.mode;
    const rationale = forceMode
      ? `Mode forced to ${forceMode} (router suggested ${decision.mode}: ${decision.rationale})`
      : decision.rationale;

    // 2. Retrieve. Graph context is what makes multi-hop questions answerable,
    //    so it follows the mode rather than being on unconditionally.
    const retrieval = await queryHydra({
      question,
      mode,
      graphContext: mode === "thinking",
      // Thinking mode exists for questions spanning several sources, so its
      // budget has to cover all of them. At 10 chunks a five-source question
      // was answered from whichever two sources ranked highest, and the model
      // then stated confidently that the others contained nothing — the worst
      // kind of wrong, because the omission is invisible in the answer.
      maxResults: mode === "thinking" ? 24 : 10,
      collections: collectionsForQuestion(decision, question),
    });

    // 3. Synthesize. An empty retrieval is answered honestly rather than
    //    sent to the model to hallucinate over.
    if (!retrieval.chunks.length) {
      const answer: AskAnswer = {
        answer:
          "No indexed context matched that question. If you have just connected a source, its first sync may still be running — check the Connectors page. Otherwise, try naming a specific person, ticket or channel.",
        confidence: "low",
        sourcesUsed: [],
        requiresFollowup: true,
        sources: [],
        meta: {
          mode,
          routingRationale: rationale,
          latencyMs: Date.now() - started,
          retrievalMs: retrieval.latencyMs,
          synthesisMs: 0,
          hydraCalls: retrieval.apiCalls,
          chunksRetrieved: 0,
          graphPathsUsed: 0,
          model: "(skipped — no context retrieved)",
          estimatedCostUsd: 0,
        },
      };

      await safeRecord({
        question,
        mode,
        rationale,
        answer,
        sourcesHit: [],
      });

      return ok(answer);
    }

    const context = buildContext(retrieval.chunks, retrieval.graphPaths);
    const synthesis = await synthesizeAnswer({ question, context });

    const sources = dedupeSources(retrieval);
    const estimatedCostUsd = estimateCostUsd(
      synthesis.promptTokens,
      synthesis.completionTokens
    );

    const answer: AskAnswer = {
      answer: synthesis.answer,
      confidence: synthesis.confidence,
      sourcesUsed: synthesis.sourcesUsed,
      requiresFollowup: synthesis.requiresFollowup,
      sources,
      meta: {
        mode,
        routingRationale: rationale,
        latencyMs: Date.now() - started,
        retrievalMs: retrieval.latencyMs,
        synthesisMs: synthesis.latencyMs,
        hydraCalls: retrieval.apiCalls,
        chunksRetrieved: retrieval.chunks.length,
        graphPathsUsed: retrieval.graphPaths.length,
        model: synthesis.model,
        promptTokens: synthesis.promptTokens,
        completionTokens: synthesis.completionTokens,
        estimatedCostUsd,
      },
    };

    await safeRecord({
      question,
      mode,
      rationale,
      answer,
      sourcesHit: sources
        .map((s) => s.provider ?? s.collection ?? "unknown")
        .filter((v, i, arr) => arr.indexOf(v) === i),
    });

    return ok(answer);
  });
}

/**
 * Metrics are observability, not the product. A logging failure must never
 * cost the user the answer they just waited for.
 */
async function safeRecord({
  question,
  mode,
  rationale,
  answer,
  sourcesHit,
}: {
  question: string;
  mode: "fast" | "thinking" | "auto";
  rationale: string;
  answer: AskAnswer;
  sourcesHit: string[];
}) {
  try {
    await recordMetric({
      question,
      mode,
      routingRationale: rationale,
      latencyMs: answer.meta.latencyMs,
      retrievalMs: answer.meta.retrievalMs,
      synthesisMs: answer.meta.synthesisMs,
      hydraCalls: answer.meta.hydraCalls,
      chunksRetrieved: answer.meta.chunksRetrieved,
      sourcesHit,
      confidence: answer.confidence,
      answer: answer.answer,
      estimatedCostUsd: answer.meta.estimatedCostUsd,
      kind: "ask",
    });
  } catch (error) {
    console.error("[devpulse] failed to record metric:", error);
  }
}

/**
 * Prefers HydraDB's deduplicated source list, falling back to chunk metadata
 * when the response omits it, so the Sources panel is never empty for an
 * answer that clearly used context.
 */
function dedupeSources(retrieval: {
  sources: AnswerSource[] | Array<Record<string, unknown>>;
  chunks: Array<{
    sourceTitle: string;
    provider?: string;
    url?: string;
    collection: string;
    lastUpdated?: string;
  }>;
}): AnswerSource[] {
  const fromSources = (retrieval.sources as AnswerSource[]) ?? [];
  if (fromSources.length) {
    return fromSources.map((source) => ({
      title: source.title,
      provider: source.provider,
      url: source.url,
      collection: source.collection,
      timestamp: source.timestamp,
      externalId: source.externalId,
    }));
  }

  const seen = new Map<string, AnswerSource>();
  for (const chunk of retrieval.chunks) {
    if (seen.has(chunk.sourceTitle)) continue;
    seen.set(chunk.sourceTitle, {
      title: chunk.sourceTitle,
      provider: chunk.provider ?? chunk.collection,
      url: chunk.url,
      collection: chunk.collection,
      timestamp: chunk.lastUpdated,
    });
  }
  return Array.from(seen.values());
}
