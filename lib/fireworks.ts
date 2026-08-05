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
  return (
    optionalEnv("FIREWORKS_MODEL_ID") ??
    "accounts/fireworks/models/kimi-k2-instruct-0905"
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
}: {
  question: string;
  context: string;
  extraInstruction?: string;
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
      max_tokens: 1400,
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
      max_tokens: 1400,
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

  const candidate = extractJsonObject(raw);
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

  return {
    answer: raw,
    confidence: inferConfidence(raw),
    sourcesUsed: extractCitedTitles(raw),
    requiresFollowup: /not enough (information|context)|cannot (confidently )?(determine|answer)|no (relevant )?context/i.test(
      raw
    ),
    wasJson: false,
  };
}

/** Finds a JSON object even when fenced or surrounded by commentary. */
function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
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
