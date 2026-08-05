/**
 * Fast-vs-thinking routing.
 *
 * The hackathon question is "how far can you push fast mode without sacrificing
 * accuracy", so DevPulse decides deliberately rather than delegating to
 * `mode: "auto"`. Thinking mode costs materially more latency, so it is spent
 * only where a second logical hop is actually required.
 *
 * The classifier scores explainable signals and returns the reasons alongside
 * the decision — those reasons drive the live trace in the Ask tab and the
 * routing column in the Metrics tab. A rule that cannot be explained to a judge
 * is not worth having.
 *
 * Pure and dependency-free, so it is safe to import from client components too.
 */

import type { RecallMode } from "./types";

export const PROVIDER_KEYWORDS: Record<string, string[]> = {
  github: ["github", "pr", "pull request", "commit", "merge", "merged", "branch", "repo"],
  slack: ["slack", "channel", "thread", "dm", "message"],
  linear: ["linear", "ticket", "issue", "sprint", "backlog", "cycle"],
  notion: ["notion", "doc", "spec", "rfc", "wiki", "page"],
  gmail: ["gmail", "email", "inbox", "mail"],
};

/** e.g. BUG-123, ENG-4021 — a strong signal that a specific record is meant. */
const TICKET_PATTERN = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/;

const MULTI_HOP_PHRASES = [
  "source of truth",
  "across",
  "cross-reference",
  "compare",
  "versus",
  " vs ",
  "still blocked",
  "last sprint",
  "this sprint",
  "has anyone",
  "has he",
  "has she",
  "has they",
  "have they",
  "did anyone",
  "where have",
  "which channel",
  "who filed",
  "started implementing",
  "and what",
  "and where",
  "and has",
  "and which",
  "follow up",
  "followed up",
  "responded",
  "decided",
  "decision",
];

const WH_WORDS = ["who", "what", "where", "when", "which", "why", "how"];

/** Temporal comparison implies retrieving two states and diffing them. */
const TEMPORAL_COMPARISON = [
  "still",
  "last week",
  "last sprint",
  "this sprint",
  "since",
  "changed",
  "moved",
  "again",
  "previously",
  "yesterday",
];

export interface RoutingSignal {
  name: string;
  weight: number;
  detail: string;
}

export interface RoutingDecision {
  mode: RecallMode;
  score: number;
  /** Score at or above which thinking mode is selected. */
  threshold: number;
  signals: RoutingSignal[];
  /** One-line explanation rendered in the UI trace. */
  rationale: string;
  /** Providers named in the question, used to scope collections. */
  providersMentioned: string[];
}

const THRESHOLD = 3;

/**
 * Classifies a question BEFORE any HydraDB call, so the mode is a decision the
 * app owns and can report on.
 */
export function classifyQueryComplexity(question: string): RoutingDecision {
  const text = question.toLowerCase().trim();
  const signals: RoutingSignal[] = [];

  // 1. Multiple sources named → the answer must be stitched across systems.
  const providersMentioned = Object.entries(PROVIDER_KEYWORDS)
    .filter(([, keywords]) => keywords.some((k) => text.includes(k)))
    .map(([provider]) => provider);

  if (providersMentioned.length >= 2) {
    signals.push({
      name: "multi_source",
      weight: 3,
      detail: `mentions ${providersMentioned.length} sources (${providersMentioned.join(", ")})`,
    });
  } else if (providersMentioned.length === 1) {
    signals.push({
      name: "single_source",
      weight: 0,
      detail: `scoped to ${providersMentioned[0]}`,
    });
  }

  // 2. Several question words → several things being asked at once.
  const whCount = WH_WORDS.filter((w) =>
    new RegExp(`\\b${w}\\b`).test(text)
  ).length;
  if (whCount >= 2) {
    signals.push({
      name: "compound_question",
      weight: 2,
      detail: `${whCount} question words in one ask`,
    });
  }

  // 3. A ticket ID plus a person or a second entity is the canonical
  //    "who filed BUG-123 and what did they say" multi-hop shape.
  if (TICKET_PATTERN.test(question)) {
    const withEntity = whCount >= 1 || /\band\b/.test(text);
    signals.push({
      name: "ticket_reference",
      weight: withEntity ? 2 : 1,
      detail: withEntity
        ? "ticket ID combined with another entity"
        : "ticket ID lookup",
    });
  }

  // 4. Explicit multi-hop phrasing.
  const phrases = MULTI_HOP_PHRASES.filter((p) => text.includes(p));
  if (phrases.length) {
    signals.push({
      name: "multi_hop_phrasing",
      weight: Math.min(3, phrases.length + 1),
      detail: `phrasing implies linked facts (${phrases.slice(0, 3).join(", ")})`,
    });
  }

  // 5. Temporal comparison → two points in time must be retrieved and diffed.
  const temporal = TEMPORAL_COMPARISON.filter((t) => text.includes(t));
  if (temporal.length >= 2) {
    signals.push({
      name: "temporal_comparison",
      weight: 2,
      detail: `compares across time (${temporal.slice(0, 2).join(", ")})`,
    });
  }

  // 6. Long, clause-heavy questions tend to bundle several asks.
  const clauses = text.split(/,| and | then |;/).filter((c) => c.trim().length > 8);
  if (clauses.length >= 3) {
    signals.push({
      name: "multi_clause",
      weight: 1,
      detail: `${clauses.length} clauses`,
    });
  }

  const score = signals.reduce((total, s) => total + s.weight, 0);
  const mode: RecallMode = score >= THRESHOLD ? "thinking" : "fast";

  return {
    mode,
    score,
    threshold: THRESHOLD,
    signals,
    providersMentioned,
    rationale: buildRationale(mode, score, signals),
  };
}

function buildRationale(
  mode: RecallMode,
  score: number,
  signals: RoutingSignal[]
): string {
  const contributing = signals.filter((s) => s.weight > 0);

  if (mode === "fast") {
    return contributing.length
      ? `Single-hop lookup (score ${score}/${THRESHOLD}) — fast mode is sufficient.`
      : `No multi-hop signals detected (score ${score}/${THRESHOLD}) — fast mode.`;
  }

  const top = contributing
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((s) => s.detail)
    .join("; ");

  return `Multi-hop detected (score ${score}/${THRESHOLD}) — ${top}. Using thinking mode with graph context.`;
}

/**
 * Narrows retrieval to the collections a question actually concerns.
 *
 * Returns undefined for cross-source questions: scoping those would defeat the
 * point. Only a question naming exactly one provider is scoped, and only when
 * it reads as source-specific rather than incidental.
 */
export function collectionsForQuestion(
  decision: RoutingDecision,
  question: string
): string[] | undefined {
  if (decision.providersMentioned.length !== 1) return undefined;

  const text = question.toLowerCase();
  const scopedPhrasing = /\bonly\b|\bin (github|slack|linear|notion|gmail)\b|\bon (github|slack|linear|notion|gmail)\b/.test(
    text
  );

  return scopedPhrasing ? decision.providersMentioned : undefined;
}
