/**
 * Fireworks AI synthesis.
 *
 * Fireworks is OpenAI-compatible, so the official OpenAI SDK is pointed at
 * their base URL. The model is env-driven (FIREWORKS_MODEL_ID) because the
 * serverless catalogue changes often — `npm run list-models` prints the IDs an
 * account can actually call.
 *
 * Server-only.
 */

import "server-only";

import OpenAI from "openai";

import { optionalEnv, requireEnv } from "./env";
import type { RetrievedChunk, GraphPath } from "./hydradb";
import type { AnswerConfidence } from "./types";

let _client: OpenAI | null = null;

export function fireworks(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: requireEnv("FIREWORKS_API_KEY"),
    baseURL: "https://api.fireworks.ai/inference/v1",
  });
  return _client;
}

export function modelId(): string {
  // The fallback is only a last resort — the catalogue changes, so any pinned
  // ID can stop existing. `npm run list-models` prints what an account can
  // actually call. Prefer a non-reasoning model here: reasoning models emit
  // their chain of thought, which competes with the answer for the token
  // budget and truncates the JSON envelope.
  return (
    optionalEnv("FIREWORKS_MODEL_ID") ?? "accounts/fireworks/models/gpt-oss-120b"
  );
}

export const SYSTEM_PROMPT = `You are DevPulse, an engineering intelligence assistant. You answer questions about a software team using ONLY the context provided below, which was retrieved from the team's GitHub, Slack, Linear, Notion, and Gmail. Every claim you make must be traceable to a specific piece of provided context. If the context does not contain enough information to answer confidently, say so explicitly rather than guessing. When multiple sources mention the same event or request, note that explicitly and state which source should be treated as the primary record. Cite sources inline using [Source: <title>] notation.`;

/**
 * Requested shape when the model supports JSON mode. Kept small deliberately —
 * models follow a tight schema far more reliably than a sprawling one.
 */
const JSON_INSTRUCTION = `Respond with a single JSON object and nothing else, matching exactly this schema:
{
  "answer": string,               // the full answer, with inline [Source: <title>] citations
  "confidence": "high" | "medium" | "low",
  "sources_used": string[],       // titles of the sources you actually cited
  "requires_followup": boolean    // true if the context was insufficient to answer fully
}`;

export interface SynthesisResult {
  answer: string;
  confidence: AnswerConfidence;
  sourcesUsed: string[];
  requiresFollowup: boolean;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  model: string;
  /** False when the model ignored JSON mode and the text had to be parsed. */
  structured: boolean;
}

/**
 * Builds the context block.
 *
 * Chunks are numbered and labelled with provider and title so the model has
 * something concrete to cite, and graph relations are included separately —
 * they are what let it answer "who filed this and what did they say elsewhere"
 * rather than just surfacing the nearest text.
 */
export function buildContext(
  chunks: RetrievedChunk[],
  graphPaths: GraphPath[]
): string {
  const parts: string[] = [];

  if (chunks.length) {
    parts.push("=== RETRIEVED CONTEXT ===");
    chunks.forEach((chunk, index) => {
      const provider = chunk.provider ?? chunk.collection ?? chunk.sourceType;
      const when = chunk.lastUpdated ? ` | updated ${chunk.lastUpdated}` : "";
      const link = chunk.url ? ` | ${chunk.url}` : "";
      parts.push(
        `\n[${index + 1}] Source: ${chunk.sourceTitle} (${provider}${when})${link}\n${chunk.content.trim()}`
      );
    });
  }

  if (graphPaths.length) {
    parts.push("\n=== RELATIONSHIPS FROM THE CONTEXT GRAPH ===");
    parts.push(
      "These are entity relationships HydraDB linked across sources. Use them to connect people, tickets and discussions that appear in different systems."
    );
    graphPaths.forEach((path, index) => {
      parts.push(`(${index + 1}) ${path.description}`);
    });
  }

  if (!parts.length) {
    return "=== RETRIEVED CONTEXT ===\n(No context was retrieved for this question.)";
  }

  return parts.join("\n");
}

/**
 * Calls Fireworks and returns a normalised result.
 *
 * JSON mode is attempted first; if the model rejects `response_format` the call
 * is retried as plain text and the response is parsed heuristically. A model
 * that does not support structured output degrades the metadata, not the answer.
 */
export async function synthesizeAnswer({
  question,
  context,
  extraInstruction,
  maxTokens = 2400,
}: {
  question: string;
  context: string;
  extraInstruction?: string;
  /**
   * Generous by default. Running out mid-answer truncates the JSON envelope,
   * which costs the whole structured response — a far worse outcome than the
   * marginal tokens. Multi-section output (the standup brief) should raise it.
   */
  maxTokens?: number;
}): Promise<SynthesisResult> {
  const model = modelId();
  const client = fireworks();

  const userMessage = [
    context,
    extraInstruction ? `\n=== ADDITIONAL INSTRUCTIONS ===\n${extraInstruction}` : "",
    `\n=== QUESTION ===\n${question}`,
    `\n${JSON_INSTRUCTION}`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: userMessage },
  ];

  const started = Date.now();
  let structured = true;

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    });
  } catch (error) {
    if (!isUnsupportedResponseFormat(error)) throw error;
    // Model does not support JSON mode — fall back to plain text.
    structured = false;
    completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    });
  }

  const latencyMs = Date.now() - started;
  const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseAnswer(raw);

  return {
    ...parsed,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
    latencyMs,
    model,
    structured: structured && parsed.wasJson,
  };
}

/** A 400 mentioning response_format means the model lacks JSON mode. */
function isUnsupportedResponseFormat(error: unknown): boolean {
  const anyError = error as { status?: number; message?: string };
  if (anyError?.status !== 400) return false;
  return /response_format|json_object|json mode/i.test(anyError.message ?? "");
}

interface ParsedAnswer {
  answer: string;
  confidence: AnswerConfidence;
  sourcesUsed: string[];
  requiresFollowup: boolean;
  wasJson: boolean;
}

/**
 * Parses the model output.
 *
 * Handles three cases without throwing: clean JSON, JSON wrapped in prose or a
 * ```json fence, and plain prose. Prose still yields a usable answer — cited
 * titles are recovered from the [Source: …] markers.
 */
export function parseAnswer(raw: string): ParsedAnswer {
  if (!raw) {
    return {
      answer:
        "The model returned an empty response. Try rephrasing the question.",
      confidence: "low",
      sourcesUsed: [],
      requiresFollowup: true,
      wasJson: false,
    };
  }

  const text = stripReasoning(raw) || raw;

  const candidate = extractJsonObject(text);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const answer = typeof parsed.answer === "string" ? parsed.answer : "";
      if (answer) {
        return {
          answer,
          confidence: normaliseConfidence(parsed.confidence),
          sourcesUsed: Array.isArray(parsed.sources_used)
            ? parsed.sources_used.map(String)
            : extractCitedTitles(answer),
          requiresFollowup: parsed.requires_followup === true,
          wasJson: true,
        };
      }
    } catch {
      // Fall through to prose handling.
    }
  }

  // The model produced JSON but ran out of tokens before closing it, so no
  // balanced object exists. Salvage the answer string rather than showing the
  // user a raw `{"answer":"…` envelope — the content is there, only the
  // punctuation is missing.
  const truncated = recoverTruncatedAnswer(text);
  if (truncated) {
    return {
      answer: truncated,
      // Never "high": the answer is by definition cut off mid-thought.
      confidence: "medium",
      sourcesUsed: extractCitedTitles(truncated),
      requiresFollowup: true,
      wasJson: false,
    };
  }

  return {
    answer: text,
    confidence: inferConfidence(text),
    sourcesUsed: extractCitedTitles(text),
    requiresFollowup: /not enough (information|context)|cannot (confidently )?(determine|answer)|no (relevant )?context/i.test(
      text
    ),
    wasJson: false,
  };
}

/**
 * Removes a reasoning model's visible chain of thought.
 *
 * Reasoning models emit their working before the answer. Left in, it becomes
 * the "answer" the user reads — pages of "Let me trace through the context…"
 * and self-directed drafting notes. Tagged blocks are stripped here; untagged
 * reasoning is handled by extractJsonObject preferring the *last* valid object,
 * which is the answer rather than anything quoted while thinking.
 */
function stripReasoning(raw: string): string {
  return raw
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    // An unclosed opening tag means the model was cut off mid-thought; keep
    // whatever came before it rather than discarding the whole response.
    .replace(/<(think|thinking|reasoning)>[\s\S]*$/i, "")
    .trim();
}

/**
 * Finds a JSON object even when fenced, or preceded by commentary or reasoning.
 *
 * Scans for balanced brace spans and returns the last one that both parses and
 * carries an `answer` field. Taking the first `{` to the last `}` — the obvious
 * approach — breaks as soon as the model writes a brace while thinking, because
 * the resulting span spliced together two unrelated objects.
 */
function extractJsonObject(raw: string): string | null {
  // Collected with exec rather than spreading matchAll: the project targets a
  // pre-ES2015 lib, where iterating a RegExp iterator needs downlevelIteration.
  const fenced: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(raw)) !== null) fenced.push(match[1].trim());

  const haystacks = fenced.length ? fenced.reverse() : [raw];

  for (const text of haystacks) {
    const spans = balancedObjectSpans(text);
    for (let i = spans.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(spans[i]) as Record<string, unknown>;
        if (typeof parsed.answer === "string" && parsed.answer.trim()) {
          return spans[i];
        }
      } catch {
        // Not valid JSON — keep scanning earlier spans.
      }
    }
  }
  return null;
}

/**
 * Pulls the `answer` value out of a JSON object that was never closed.
 *
 * Walks the string literal by hand, honouring escapes, and stops at the
 * unescaped closing quote or at the end of the text — whichever comes first.
 * Returns null unless this really looks like a truncated envelope, so ordinary
 * prose that happens to contain the word "answer" is left alone.
 */
function recoverTruncatedAnswer(text: string): string | null {
  const match = /\{\s*"answer"\s*:\s*"/.exec(text);
  if (!match) return null;

  let out = "";
  let escaped = false;
  for (let i = match.index + match[0].length; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      out += char === "n" ? "\n" : char === "t" ? "\t" : char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      break;
    } else {
      out += char;
    }
  }

  const answer = out.trim();
  return answer.length > 40 ? answer : null;
}

/** Every balanced `{…}` span in the text, ignoring braces inside strings. */
function balancedObjectSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        spans.push(text.slice(start, i + 1));
        start = -1;
      } else if (depth < 0) {
        depth = 0;
      }
    }
  }
  return spans;
}

function normaliseConfidence(value: unknown): AnswerConfidence {
  const text = String(value ?? "").toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  return "medium";
}

function inferConfidence(text: string): AnswerConfidence {
  if (/not enough|insufficient|cannot determine|unclear|no context/i.test(text))
    return "low";
  if (/likely|appears|seems|probably|may have/i.test(text)) return "medium";
  return "medium";
}

export function extractCitedTitles(text: string): string[] {
  const titles = new Set<string>();
  const pattern = /\[Source:\s*([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const title = match[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

/**
 * Rough cost estimate for the metrics dashboard.
 *
 * Fireworks prices per model and DevPulse's model is swappable, so this uses a
 * single blended mid-range rate. It is an order-of-magnitude signal for
 * comparing questions against each other, not a billing figure.
 */
const USD_PER_MILLION_INPUT = 0.9;
const USD_PER_MILLION_OUTPUT = 4.0;

export function estimateCostUsd(
  promptTokens = 0,
  completionTokens = 0
): number {
  return (
    (promptTokens / 1_000_000) * USD_PER_MILLION_INPUT +
    (completionTokens / 1_000_000) * USD_PER_MILLION_OUTPUT
  );
}
