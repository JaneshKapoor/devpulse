/**
 * Types shared between server and client.
 *
 * This module has no imports and no side effects, so client components can use
 * these shapes without transitively pulling in `lib/hydradb.ts`, which is
 * marked `server-only` and would throw if it reached a browser bundle.
 */

export type RecallMode = "fast" | "thinking" | "auto";

export type AnswerConfidence = "high" | "medium" | "low";

/** One source the answer is grounded in, as rendered in the Sources list. */
export interface AnswerSource {
  title: string;
  provider?: string;
  url?: string;
  collection?: string;
  timestamp?: string;
  externalId?: string;
}

/** Everything the metadata strip under an answer reports. */
export interface AnswerMeta {
  mode: RecallMode;
  routingRationale: string;
  latencyMs: number;
  retrievalMs: number;
  synthesisMs: number;
  hydraCalls: number;
  chunksRetrieved: number;
  graphPathsUsed: number;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd: number;
}

export interface AskAnswer {
  answer: string;
  confidence: AnswerConfidence;
  sourcesUsed: string[];
  requiresFollowup: boolean;
  sources: AnswerSource[];
  meta: AnswerMeta;
}

/** One row in the Metrics tab. */
export interface QueryMetric {
  id: string;
  timestamp: string;
  question: string;
  mode: RecallMode;
  routingRationale: string;
  latencyMs: number;
  retrievalMs: number;
  synthesisMs: number;
  hydraCalls: number;
  chunksRetrieved: number;
  sourcesHit: string[];
  confidence: AnswerConfidence;
  answer: string;
  estimatedCostUsd: number;
  kind: "ask" | "standup";
}

export interface MetricsSummary {
  total: number;
  fastCount: number;
  thinkingCount: number;
  fastPercentage: number;
  avgLatencyMs: number;
  avgFastLatencyMs: number;
  avgThinkingLatencyMs: number;
  avgHydraCalls: number;
  totalCostUsd: number;
  highConfidencePercentage: number;
}
