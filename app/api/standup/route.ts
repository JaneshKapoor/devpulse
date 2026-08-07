import { fail, handler, ok } from "@/lib/api";
import {
  buildContext,
  estimateCostUsd,
  synthesizeAnswer,
} from "@/lib/fireworks";
import { queryHydra, type HydraQueryResult } from "@/lib/hydradb";
import { recordMetric } from "@/lib/metrics-store";
import type { AnswerSource, RecallMode } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The standup brief is assembled from four narrow, parallel retrievals rather
 * than one broad question.
 *
 * Each leg gets the cheapest mode that can answer it: shipped work and closed
 * tickets are single-hop lookups and stay on fast mode, while "what is blocked
 * and why" genuinely needs to link a blocked ticket to the conversation
 * explaining it, so only that leg pays for thinking mode. Running them in
 * parallel means the brief costs roughly the latency of its slowest leg.
 */
const STANDUP_QUERIES: Array<{
  id: string;
  question: string;
  mode: RecallMode;
  collections?: string[];
  heading: string;
}> = [
  {
    id: "shipped",
    question:
      "What pull requests were merged, and what commits landed, in the last two days?",
    mode: "fast",
    collections: ["github"],
    heading: "Shipped",
  },
  {
    id: "tickets",
    question:
      "Which issues moved to done, in review, or changed status recently?",
    mode: "fast",
    collections: ["linear"],
    heading: "Ticket movement",
  },
  {
    id: "blocked",
    question:
      "What work is currently blocked or waiting on someone, and what did the team say about why?",
    mode: "thinking",
    heading: "Blocked / waiting",
  },
  {
    id: "discussion",
    question:
      "What decisions, disagreements or open questions came up in team discussion recently?",
    mode: "fast",
    collections: ["slack"],
    heading: "Discussion",
  },
];

const BRIEF_INSTRUCTION = `Write a standup brief for an engineering team, grouped under these headings, in this order:

1. Shipped — what actually landed
2. In progress — what is moving
3. Blocked / needs attention — what is stuck and who is waiting on whom
4. Worth knowing — decisions or discussion the team should be aware of

Rules:
- Use short bullet points, not paragraphs.
- Attribute work to people by name wherever the context supports it.
- Cite every bullet with [Source: <title>].
- Omit a heading entirely if the context contains nothing for it. Do not pad.
- If the same work appears in multiple sources, state it once and note which source is the primary record.`;

export async function POST() {
  return handler(async () => {
    const started = Date.now();

    // Parallel: the brief costs roughly its slowest leg, not their sum.
    const settled = await Promise.allSettled(
      STANDUP_QUERIES.map((spec) =>
        queryHydra({
          question: spec.question,
          mode: spec.mode,
          graphContext: spec.mode === "thinking",
          // The blockers leg is unscoped across every source, so it needs a
          // wider budget than the single-collection legs beside it.
          maxResults: spec.mode === "thinking" ? 24 : 10,
          collections: spec.collections,
        })
      )
    );

    const legs = STANDUP_QUERIES.map((spec, index) => {
      const outcome = settled[index];
      return {
        ...spec,
        result: outcome.status === "fulfilled" ? outcome.value : null,
        error:
          outcome.status === "rejected"
            ? String(outcome.reason?.message ?? outcome.reason)
            : null,
      };
    });

    // One failing leg degrades the brief rather than losing it — a connector
    // that has not finished syncing should not blank the whole standup.
    const successful = legs.filter((leg) => leg.result !== null);
    const hydraCalls = legs.length;
    const retrievalMs = Date.now() - started;

    // But if *every* leg failed, the cause is systemic (missing credentials,
    // database not provisioned, HydraDB unreachable) — not an empty workspace.
    // Reporting "no recent activity" here would send the user to debug their
    // connectors when the real fix is elsewhere, so surface the actual error.
    if (!successful.length) {
      const reasons = Array.from(
        new Set(legs.map((leg) => leg.error).filter(Boolean) as string[])
      );
      // Rethrow so the shared handler maps it to the right status and code
      // (a missing env var becomes an actionable 400, not a 500).
      const firstRejection = settled.find((s) => s.status === "rejected");
      if (firstRejection && firstRejection.status === "rejected") {
        throw firstRejection.reason;
      }
      return fail(
        `Every standup query failed: ${reasons.join("; ")}`,
        "STANDUP_ALL_LEGS_FAILED",
        502
      );
    }

    const allChunks = successful.flatMap((leg) => leg.result!.chunks);
    const allGraphPaths = successful.flatMap((leg) => leg.result!.graphPaths);

    if (!allChunks.length) {
      const brief = {
        brief:
          "No recent activity was found across the connected sources. If you have just run a sync, indexing may still be in progress — check the Connectors page.",
        confidence: "low" as const,
        sources: [] as AnswerSource[],
        sections: legs.map((leg) => ({
          id: leg.id,
          heading: leg.heading,
          mode: leg.mode,
          chunks: 0,
          error: leg.error,
        })),
        meta: {
          mode: "thinking" as RecallMode,
          routingRationale: `${legs.filter((l) => l.mode === "fast").length} fast legs + ${legs.filter((l) => l.mode === "thinking").length} thinking leg, run in parallel`,
          latencyMs: Date.now() - started,
          retrievalMs,
          synthesisMs: 0,
          hydraCalls,
          chunksRetrieved: 0,
          graphPathsUsed: 0,
          model: "(skipped — no context retrieved)",
          estimatedCostUsd: 0,
        },
      };
      return ok(brief);
    }

    // Label each chunk with the leg it came from so the model can group
    // correctly instead of inferring structure from raw text.
    const labelledContext = successful
      .map((leg) =>
        [
          `\n### ${leg.heading.toUpperCase()} (retrieved in ${leg.mode} mode)`,
          buildContext(leg.result!.chunks, leg.result!.graphPaths),
        ].join("\n")
      )
      .join("\n");

    const synthesis = await synthesizeAnswer({
      question:
        "Generate today's standup brief for this engineering team from the context above.",
      context: labelledContext,
      extraInstruction: BRIEF_INSTRUCTION,
      // Four headings of bullets is several times a single answer, and running
      // out mid-brief truncates the JSON envelope rather than just the prose.
      maxTokens: 3600,
    });

    const sources = dedupeSources(successful.map((leg) => leg.result!));
    const estimatedCostUsd = estimateCostUsd(
      synthesis.promptTokens,
      synthesis.completionTokens
    );
    const latencyMs = Date.now() - started;

    const payload = {
      brief: synthesis.answer,
      confidence: synthesis.confidence,
      sources,
      sections: legs.map((leg) => ({
        id: leg.id,
        heading: leg.heading,
        mode: leg.mode,
        chunks: leg.result?.chunks.length ?? 0,
        error: leg.error,
      })),
      meta: {
        mode: "thinking" as RecallMode,
        routingRationale: `${legs.filter((l) => l.mode === "fast").length} fast legs + ${legs.filter((l) => l.mode === "thinking").length} thinking leg, run in parallel`,
        latencyMs,
        retrievalMs,
        synthesisMs: synthesis.latencyMs,
        hydraCalls,
        chunksRetrieved: allChunks.length,
        graphPathsUsed: allGraphPaths.length,
        model: synthesis.model,
        promptTokens: synthesis.promptTokens,
        completionTokens: synthesis.completionTokens,
        estimatedCostUsd,
      },
    };

    try {
      await recordMetric({
        question: "[Standup Brief]",
        // Logged as thinking: the brief includes a thinking leg, so counting
        // it as fast would overstate the fast-mode share.
        mode: "thinking",
        routingRationale: payload.meta.routingRationale,
        latencyMs,
        retrievalMs,
        synthesisMs: synthesis.latencyMs,
        hydraCalls,
        chunksRetrieved: allChunks.length,
        sourcesHit: sources
          .map((s) => s.provider ?? s.collection ?? "unknown")
          .filter((v, i, arr) => arr.indexOf(v) === i),
        confidence: synthesis.confidence,
        answer: synthesis.answer,
        estimatedCostUsd,
        kind: "standup",
      });
    } catch (error) {
      console.error("[devpulse] failed to record standup metric:", error);
    }

    return ok(payload);
  });
}

function dedupeSources(results: HydraQueryResult[]): AnswerSource[] {
  const seen = new Map<string, AnswerSource>();

  for (const result of results) {
    for (const source of result.sources) {
      if (!seen.has(source.title)) {
        seen.set(source.title, {
          title: source.title,
          provider: source.provider,
          url: source.url,
          collection: source.collection,
          timestamp: source.timestamp,
          externalId: source.externalId,
        });
      }
    }
    // Fall back to chunk metadata when the response omits its source list.
    for (const chunk of result.chunks) {
      if (!seen.has(chunk.sourceTitle)) {
        seen.set(chunk.sourceTitle, {
          title: chunk.sourceTitle,
          provider: chunk.provider ?? chunk.collection,
          url: chunk.url,
          collection: chunk.collection,
          timestamp: chunk.lastUpdated,
        });
      }
    }
  }

  return Array.from(seen.values());
}
