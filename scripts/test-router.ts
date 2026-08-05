/**
 * Routing regression test.
 *
 *     npm run test:router
 *
 * Fast-vs-thinking selection is a judged behaviour and the heuristics are easy
 * to regress while tuning, so the intended classification for both the demo
 * questions and the single-hop cases is pinned here. No test framework — this
 * needs to run with zero setup.
 */

import {
  classifyQueryComplexity,
  collectionsForQuestion,
} from "../lib/query-router";

type Expected = "fast" | "thinking";

const CASES: Array<{ question: string; expect: Expected; why: string }> = [
  // Multi-hop: these are the questions DevPulse is built to answer.
  {
    question:
      "Who filed BUG-123, which project are they working on, and what did they say about the fix in Slack?",
    expect: "thinking",
    why: "ticket ID + person + second source",
  },
  {
    question:
      "The manager messaged Janesh about the auth PR review on Gmail, Slack, and Linear all today — which channel should I treat as the source of truth, and has he responded anywhere?",
    expect: "thinking",
    why: "three sources + source-of-truth reconciliation",
  },
  {
    question:
      "What did the team decide about the auth refactor in Slack, and has anyone started implementing it in GitHub?",
    expect: "thinking",
    why: "decision in one source, implementation in another",
  },
  {
    question: "What was blocked last sprint that is still blocked this sprint?",
    expect: "thinking",
    why: "temporal comparison across two states",
  },
  {
    question:
      "What has Priya asked Janesh to do today, across which channels, and where have they responded?",
    expect: "thinking",
    why: "featured multi-channel scenario",
  },

  // Single-hop: these must stay on fast mode or the latency story collapses.
  { question: "What is ticket ENG-402?", expect: "fast", why: "direct record lookup" },
  {
    question: "What did Sarah say about the deploy?",
    expect: "fast",
    why: "single utterance lookup",
  },
  { question: "Show me recent merged PRs", expect: "fast", why: "single-source list" },
  { question: "Who is on the platform team?", expect: "fast", why: "single fact" },
  {
    question: "Summarise the architecture doc",
    expect: "fast",
    why: "single document summary",
  },
];

const SCOPING: Array<{ question: string; expect: string[] | undefined }> = [
  { question: "What did Sarah say about the deploy only in Slack?", expect: ["slack"] },
  // Mentions GitHub vocabulary but is not explicitly scoped — must stay broad.
  { question: "Show me recent merged PRs", expect: undefined },
  // Cross-source questions must never be narrowed.
  { question: "What did the team decide in Slack and GitHub?", expect: undefined },
];

let failures = 0;

console.log("\n  Routing decisions\n");
for (const { question, expect, why } of CASES) {
  const decision = classifyQueryComplexity(question);
  const passed = decision.mode === expect;
  if (!passed) failures++;
  console.log(
    `  ${passed ? "✓" : "✗"} ${decision.mode.padEnd(8)} score ${String(decision.score).padStart(2)}/${decision.threshold}  ${question.slice(0, 58)}${question.length > 58 ? "…" : ""}`
  );
  console.log(`      ${why}`);
  if (!passed) {
    console.log(`      EXPECTED ${expect}, signals: ${decision.signals.map((s) => `${s.name}(${s.weight})`).join(", ")}`);
  }
}

console.log("\n  Collection scoping\n");
for (const { question, expect } of SCOPING) {
  const decision = classifyQueryComplexity(question);
  const actual = collectionsForQuestion(decision, question);
  const passed = JSON.stringify(actual) === JSON.stringify(expect);
  if (!passed) failures++;
  console.log(
    `  ${passed ? "✓" : "✗"} ${JSON.stringify(actual) ?? "undefined"}  ←  ${question}`
  );
  if (!passed) console.log(`      EXPECTED ${JSON.stringify(expect)}`);
}

const total = CASES.length + SCOPING.length;
console.log(
  `\n  ${total - failures}/${total} passed${failures ? ` — ${failures} FAILED` : ""}\n`
);

// Report the fast-mode share, since keeping it high is the point of routing.
const fastCount = CASES.filter(
  (c) => classifyQueryComplexity(c.question).mode === "fast"
).length;
console.log(
  `  Fast-mode share on this suite: ${Math.round((fastCount / CASES.length) * 100)}%\n`
);

process.exit(failures ? 1 : 0);
