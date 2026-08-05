/**
 * The hard cross-source questions DevPulse is built to answer.
 *
 * Surfaced as one-click chips above the Ask input so a judge can test the
 * difficult cases during a 60-second demo without typing. Each carries the
 * expected routing and the sources it should hit, which the README's
 * expected-vs-actual table is built from.
 *
 * No imports — safe for client components.
 */

export interface ExampleQuestion {
  id: string;
  /** Short chip label. */
  label: string;
  question: string;
  expectedMode: "fast" | "thinking";
  expectedSources: string[];
  /** Why this question is hard — shown as a tooltip. */
  hardBecause: string;
  featured?: boolean;
}

export const EXAMPLE_QUESTIONS: ExampleQuestion[] = [
  {
    id: "multi-channel",
    label: "Same request, three channels",
    question:
      "What has the manager asked Janesh to do today, across which channels, and where has he responded?",
    expectedMode: "thinking",
    expectedSources: ["gmail", "slack", "linear"],
    hardBecause:
      "The same request arrives in Gmail, Slack and Linear. Requires deduplicating one logical ask across three systems, naming a source of truth, and checking for a reply in each.",
    featured: true,
  },
  {
    id: "who-filed",
    label: "Who filed the bug",
    question:
      "Who filed BUG-123, which project are they working on, and what did they say about the fix in Slack?",
    expectedMode: "thinking",
    expectedSources: ["linear", "slack"],
    hardBecause:
      "Three hops: resolve a ticket ID to a person, that person to a project, then find what they said elsewhere.",
  },
  {
    id: "decision-to-code",
    label: "Decision → implementation",
    question:
      "What did the team decide about the auth refactor in Slack, and has anyone started implementing it in GitHub?",
    expectedMode: "thinking",
    expectedSources: ["slack", "github"],
    hardBecause:
      "Links a conversational decision to code activity, which share no common identifier.",
  },
  {
    id: "still-blocked",
    label: "Still blocked",
    question: "What was blocked last sprint that is still blocked this sprint?",
    expectedMode: "thinking",
    expectedSources: ["linear", "slack"],
    hardBecause:
      "Temporal comparison — retrieve two points in time and diff them, rather than retrieving one state.",
  },
  {
    id: "review-status",
    label: "Review status",
    question:
      "Which pull requests are waiting on review, and has anyone flagged them in Slack?",
    expectedMode: "thinking",
    expectedSources: ["github", "slack"],
    hardBecause:
      "Joins open review state in GitHub against chatter in Slack about the same PRs.",
  },
  {
    id: "single-lookup",
    label: "Simple lookup (fast mode)",
    question: "What did the team ship this week?",
    expectedMode: "fast",
    expectedSources: ["github"],
    hardBecause:
      "Deliberately single-hop — demonstrates that the router keeps easy questions on fast mode.",
  },
];

export const FEATURED_QUESTION = EXAMPLE_QUESTIONS.find((q) => q.featured)!;
