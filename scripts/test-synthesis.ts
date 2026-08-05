/**
 * Answer-parsing regression test.
 *
 *     npm run test:synthesis
 *
 * parseAnswer() is the most failure-prone code in the app: it has to cope with
 * a model that honours JSON mode, one that wraps JSON in prose or a fence, and
 * one that ignores the instruction entirely — without ever throwing and losing
 * an answer the user already waited for. These cases pin that behaviour.
 *
 * Runs without credentials; nothing here calls Fireworks.
 */

import {
  buildContext,
  estimateCostUsd,
  extractCitedTitles,
  parseAnswer,
} from "../lib/fireworks";

let failures = 0;

function check(name: string, condition: boolean, actual?: unknown) {
  console.log(`  ${condition ? "✓" : "✗"} ${name}`);
  if (!condition) {
    failures++;
    if (actual !== undefined) console.log(`      got: ${JSON.stringify(actual)}`);
  }
}

console.log("\n  Answer parsing\n");

// A model that honours JSON mode.
const clean = parseAnswer(
  JSON.stringify({
    answer: "Arjun Mehta filed it [Source: BUG-123]",
    confidence: "high",
    sources_used: ["BUG-123"],
    requires_followup: false,
  })
);
check("clean JSON: answer extracted", clean.answer.startsWith("Arjun"), clean.answer);
check("clean JSON: confidence preserved", clean.confidence === "high", clean.confidence);
check("clean JSON: reported as structured", clean.wasJson);

// A model that wraps JSON in a fence and chats around it.
const fenced = parseAnswer(
  'Sure:\n```json\n{"answer":"Blocked on INFRA-88 [Source: ENG-455]","confidence":"medium","sources_used":["ENG-455"],"requires_followup":false}\n```\nHope that helps!'
);
check("fenced JSON: unwrapped", fenced.answer.includes("INFRA-88"), fenced.answer);
check("fenced JSON: reported as structured", fenced.wasJson);

// A model that ignores JSON mode entirely.
const prose = parseAnswer(
  "Priya asked Janesh to review PR #482 [Source: ENG-482]. He replied in Slack [Source: #eng-platform]."
);
check("prose: answer preserved", prose.answer.includes("PR #482"), prose.answer);
check("prose: reported as unstructured", !prose.wasJson);
check(
  "prose: cited titles recovered from markers",
  prose.sourcesUsed.length === 2,
  prose.sourcesUsed
);

// Honest refusals must be surfaced, not treated as confident answers.
const insufficient = parseAnswer(
  "There is not enough information in the provided context to answer."
);
check("insufficient context: low confidence", insufficient.confidence === "low");
check("insufficient context: flags followup", insufficient.requiresFollowup);

// Degenerate inputs must not throw.
const empty = parseAnswer("");
check(
  "empty response: handled without throwing",
  empty.confidence === "low" && empty.requiresFollowup
);

const malformed = parseAnswer('{"answer": "broken');
check(
  "malformed JSON: falls back to prose",
  malformed.answer.length > 0 && !malformed.wasJson
);

const badConfidence = parseAnswer(
  JSON.stringify({ answer: "x", confidence: "VERY HIGH", sources_used: [] })
);
check(
  "unexpected confidence value: normalised",
  badConfidence.confidence === "medium",
  badConfidence.confidence
);

console.log("\n  Helpers\n");

check(
  "extractCitedTitles dedupes repeats",
  extractCitedTitles("[Source: A] and [Source: A] and [Source: B]").length === 2
);
check("estimateCostUsd returns a positive cost", estimateCostUsd(1000, 500) > 0);
check("estimateCostUsd is zero-safe", estimateCostUsd() === 0);
check(
  "buildContext states plainly when nothing was retrieved",
  buildContext([], []).includes("No context")
);

console.log(`\n  ${failures === 0 ? "All checks passed" : `${failures} FAILED`}\n`);
process.exit(failures ? 1 : 0);
