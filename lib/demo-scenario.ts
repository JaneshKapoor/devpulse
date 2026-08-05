/**
 * Seed data for the featured multi-channel scenario.
 *
 * A manager sends the same request to one engineer across Gmail, Slack and
 * Linear on the same morning. The engineer replies in exactly one of them. The
 * interesting answer is therefore not "what was asked" but "this is one request
 * duplicated across three systems, Linear is the tracked record, and the only
 * response is in Slack" — which is precisely the reasoning a single-source
 * search cannot do.
 *
 * Seeding this guarantees the demo works even when the presenter's real
 * workspace has no such pattern that day. Supporting records for the other
 * example questions are included so every chip on the Ask tab has grounding.
 *
 * No imports — this is plain data, shared by the seed script and the README.
 */

export interface SeedRecord {
  /** Collection to ingest into — matches the connector collections. */
  collection: "gmail" | "slack" | "linear" | "github" | "notion" | "docs";
  provider: string;
  title: string;
  /** Provider-assigned identifier, e.g. a Linear key or PR number. */
  externalId?: string;
  url?: string;
  author: string;
  timestamp: string;
  body: string;
  metadata?: Record<string, string>;
}

const TODAY = "2026-08-05";
const YESTERDAY = "2026-08-04";
const LAST_SPRINT = "2026-07-22";

export const MANAGER = "Priya Raghavan";
export const ENGINEER = "Janesh Kapoor";

export const DEMO_RECORDS: SeedRecord[] = [
  // === FEATURED SCENARIO: one request, three channels ======================
  {
    collection: "gmail",
    provider: "gmail",
    title: "Auth PR review — need your eyes today",
    externalId: "thread-a91f22",
    url: "https://mail.google.com/mail/u/0/#inbox/thread-a91f22",
    author: MANAGER,
    timestamp: `${TODAY}T09:12:00Z`,
    body: `From: Priya Raghavan <priya@example.com>
To: Janesh Kapoor <janesh@example.com>
Date: ${TODAY} 09:12
Subject: Auth PR review — need your eyes today

Hi Janesh,

Could you review PR #482 (refactor auth middleware to short-lived tokens) today? Security wants sign-off before the Thursday release cut, and you wrote the original middleware so you're the right reviewer.

I've also filed it as a Linear ticket so it's tracked properly — ENG-482. Treat that as the system of record; this email is just a heads-up.

Thanks,
Priya`,
    metadata: { thread_id: "thread-a91f22", to: "janesh@example.com" },
  },
  {
    collection: "slack",
    provider: "slack",
    title: "#eng-platform — Priya Raghavan",
    externalId: "C04ENGPLAT/p1754384040",
    url: "https://example.slack.com/archives/C04ENGPLAT/p1754384040",
    author: MANAGER,
    timestamp: `${TODAY}T09:34:00Z`,
    body: `[#eng-platform] Priya Raghavan — ${TODAY} 09:34
@janesh nudging you on PR #482, the auth middleware refactor. Need review today so we make the Thursday cut. Filed as ENG-482 in Linear, and I emailed you as well — sorry for the triple ping, just don't want it to slip.`,
    metadata: { channel: "eng-platform", mentions: "janesh" },
  },
  {
    collection: "slack",
    provider: "slack",
    title: "#eng-platform — Janesh Kapoor (reply)",
    externalId: "C04ENGPLAT/p1754390520",
    url: "https://example.slack.com/archives/C04ENGPLAT/p1754390520",
    author: ENGINEER,
    timestamp: `${TODAY}T11:02:00Z`,
    body: `[#eng-platform] Janesh Kapoor — ${TODAY} 11:02
@priya got it — picking up PR #482 straight after standup. One concern before I start: the refactor changes token lifetime to 15 minutes but I don't think the refresh path in the mobile client handles a mid-session expiry yet. Will flag on the PR if that's confirmed.`,
    metadata: { channel: "eng-platform", thread_parent: "p1754384040" },
  },
  {
    collection: "linear",
    provider: "linear",
    title: "ENG-482 Review auth middleware PR",
    externalId: "ENG-482",
    url: "https://linear.app/example/issue/ENG-482",
    author: MANAGER,
    timestamp: `${TODAY}T09:40:00Z`,
    body: `ENG-482 — Review auth middleware PR
Team: Platform
Status: In Progress
Assignee: ${ENGINEER}
Created by: ${MANAGER} on ${TODAY} 09:40
Priority: Urgent
Linked PR: #482 (refactor auth middleware to short-lived tokens)

Description:
Review and sign off on PR #482 before the Thursday release cut. Security requires a second reviewer on any change to token issuance. This ticket is the system of record for the request — a duplicate ask went out by email and in #eng-platform.

Comments: (none yet)`,
    metadata: { team: "Platform", status: "In Progress", assignee: ENGINEER },
  },
  {
    collection: "github",
    provider: "github",
    title: "PR #482 Refactor auth middleware to short-lived tokens",
    externalId: "482",
    url: "https://github.com/example/platform/pull/482",
    author: "Dmitri Volkov",
    timestamp: `${YESTERDAY}T16:20:00Z`,
    body: `Pull request #482 — Refactor auth middleware to short-lived tokens
Repository: example/platform
Author: Dmitri Volkov
Opened: ${YESTERDAY} 16:20
State: OPEN — review requested from ${ENGINEER}
Files changed: 11 (+412 / -180)

Description:
Replaces long-lived session tokens with 15-minute access tokens plus a refresh token, per the decision in the auth refactor thread. Adds token rotation on refresh and revocation on logout.

Review status: awaiting review from ${ENGINEER}. No approvals yet.`,
    metadata: { repo: "example/platform", state: "open", reviewer: ENGINEER },
  },

  // === BUG-123: who filed it, what project, what they said ================
  {
    collection: "linear",
    provider: "linear",
    title: "BUG-123 Checkout retries charge the card twice",
    externalId: "BUG-123",
    url: "https://linear.app/example/issue/BUG-123",
    author: "Arjun Mehta",
    timestamp: `${YESTERDAY}T10:05:00Z`,
    body: `BUG-123 — Checkout retries charge the card twice
Team: Payments
Project: Checkout Reliability
Status: In Progress
Reported by: Arjun Mehta on ${YESTERDAY} 10:05
Assignee: Arjun Mehta
Severity: High

Description:
When the payment confirmation request times out, the client retries and the charge is submitted a second time. Reproduced twice in staging. Root cause looks like the idempotency key being regenerated per attempt instead of per checkout session.`,
    metadata: { team: "Payments", project: "Checkout Reliability" },
  },
  {
    collection: "slack",
    provider: "slack",
    title: "#payments — Arjun Mehta",
    externalId: "C04PAY/p1754301900",
    url: "https://example.slack.com/archives/C04PAY/p1754301900",
    author: "Arjun Mehta",
    timestamp: `${YESTERDAY}T10:45:00Z`,
    body: `[#payments] Arjun Mehta — ${YESTERDAY} 10:45
Filed BUG-123 for the double-charge on checkout retries. The fix is to move the idempotency key generation up to the checkout session rather than minting a new one per attempt — I'm testing that now. Working on this under the Checkout Reliability project. Should have a PR up tomorrow.`,
    metadata: { channel: "payments" },
  },

  // === Auth refactor decision -> implementation ============================
  {
    collection: "slack",
    provider: "slack",
    title: "#eng-platform — auth refactor decision thread",
    externalId: "C04ENGPLAT/p1753968000",
    url: "https://example.slack.com/archives/C04ENGPLAT/p1753968000",
    author: "Dmitri Volkov",
    timestamp: `${LAST_SPRINT}T14:30:00Z`,
    body: `[#eng-platform] auth refactor thread — ${LAST_SPRINT}
Dmitri Volkov 14:30: Proposal — drop long-lived session tokens, move to 15-minute access tokens with refresh. Cuts the blast radius of a leaked token from days to minutes.
Priya Raghavan 14:38: Agreed in principle. What's the migration story for existing sessions?
Dmitri Volkov 14:44: Dual-accept both formats for two weeks, then hard cutoff.
Janesh Kapoor 15:02: Fine by me as long as the mobile refresh path is handled — that's the piece I'd worry about.
Priya Raghavan 15:10: Decision: we go with short-lived tokens + refresh, dual-accept window of two weeks. Dmitri to implement. Logging it here as the decision of record.`,
    metadata: { channel: "eng-platform", is_decision: "true" },
  },

  // === Blocked last sprint / still blocked this sprint =====================
  {
    collection: "linear",
    provider: "linear",
    title: "ENG-455 Migrate session store to Redis cluster",
    externalId: "ENG-455",
    url: "https://linear.app/example/issue/ENG-455",
    author: "Dmitri Volkov",
    timestamp: `${LAST_SPRINT}T09:00:00Z`,
    body: `ENG-455 — Migrate session store to Redis cluster
Team: Platform
Status: Blocked
Assignee: Dmitri Volkov
Blocked since: ${LAST_SPRINT} (previous sprint)
Still blocked as of: ${TODAY} (current sprint)

Blocker: waiting on the infrastructure team to provision the production Redis cluster. Ticket INFRA-88 has not moved in two weeks. This was raised as blocked in the previous sprint review and remains blocked in the current sprint.`,
    metadata: { team: "Platform", status: "Blocked", blocked: "true" },
  },
  {
    collection: "linear",
    provider: "linear",
    title: "ENG-470 Rate limiting for public API",
    externalId: "ENG-470",
    url: "https://linear.app/example/issue/ENG-470",
    author: "Sofia Almeida",
    timestamp: `${LAST_SPRINT}T11:15:00Z`,
    body: `ENG-470 — Rate limiting for public API
Team: Platform
Status: Done
Assignee: Sofia Almeida
Was blocked during ${LAST_SPRINT} sprint pending a decision on limits; unblocked ${YESTERDAY} once Priya confirmed 1000 req/min per key. Shipped ${TODAY}.`,
    metadata: { team: "Platform", status: "Done" },
  },
  {
    collection: "slack",
    provider: "slack",
    title: "#eng-platform — sprint review blockers",
    externalId: "C04ENGPLAT/p1754297400",
    url: "https://example.slack.com/archives/C04ENGPLAT/p1754297400",
    author: MANAGER,
    timestamp: `${TODAY}T08:30:00Z`,
    body: `[#eng-platform] Priya Raghavan — ${TODAY} 08:30
Sprint review notes: ENG-455 (Redis cluster migration) is still blocked on INFRA-88, same as last sprint — Dmitri has been waiting two weeks now and I'm escalating today. ENG-470 (rate limiting) was blocked last sprint but is now done. Everything else moved.`,
    metadata: { channel: "eng-platform" },
  },

  // === Shipped work, for the fast-mode question and standup ================
  {
    collection: "github",
    provider: "github",
    title: "PR #479 Add idempotency keys to checkout session (merged)",
    externalId: "479",
    url: "https://github.com/example/platform/pull/479",
    author: "Arjun Mehta",
    timestamp: `${TODAY}T13:40:00Z`,
    body: `Pull request #479 — Add idempotency keys to checkout session
Repository: example/payments
Author: Arjun Mehta
State: MERGED on ${TODAY} 13:40
Approved by: Sofia Almeida
Files changed: 6 (+188 / -42)

Moves idempotency key generation from per-attempt to per-checkout-session, fixing the double-charge in BUG-123.`,
    metadata: { repo: "example/payments", state: "merged" },
  },
  {
    collection: "github",
    provider: "github",
    title: "PR #476 Rate limiter middleware (merged)",
    externalId: "476",
    url: "https://github.com/example/platform/pull/476",
    author: "Sofia Almeida",
    timestamp: `${TODAY}T10:15:00Z`,
    body: `Pull request #476 — Rate limiter middleware for the public API
Repository: example/platform
Author: Sofia Almeida
State: MERGED on ${TODAY} 10:15
Approved by: Dmitri Volkov

Implements ENG-470: token-bucket rate limiting at 1000 req/min per API key, with per-key overrides.`,
    metadata: { repo: "example/platform", state: "merged" },
  },
  {
    collection: "github",
    provider: "github",
    title: "PR #481 Fix flaky session expiry test (awaiting review)",
    externalId: "481",
    url: "https://github.com/example/platform/pull/481",
    author: "Sofia Almeida",
    timestamp: `${TODAY}T09:55:00Z`,
    body: `Pull request #481 — Fix flaky session expiry test
Repository: example/platform
Author: Sofia Almeida
State: OPEN — review requested from Dmitri Volkov
Opened: ${TODAY} 09:55

Waiting on review since this morning.`,
    metadata: { repo: "example/platform", state: "open" },
  },
  {
    collection: "slack",
    provider: "slack",
    title: "#eng-platform — review queue nudge",
    externalId: "C04ENGPLAT/p1754392200",
    url: "https://example.slack.com/archives/C04ENGPLAT/p1754392200",
    author: "Sofia Almeida",
    timestamp: `${TODAY}T11:30:00Z`,
    body: `[#eng-platform] Sofia Almeida — ${TODAY} 11:30
Two PRs sitting in the review queue: #481 (flaky session expiry test, needs Dmitri) and #482 (auth middleware, needs Janesh). Both blocking the Thursday cut if they don't land today.`,
    metadata: { channel: "eng-platform" },
  },

  // === Notion spec, so document-grounded questions have something =========
  {
    collection: "notion",
    provider: "notion",
    title: "Auth Token Lifetime RFC",
    externalId: "notion-rfc-auth",
    url: "https://notion.so/example/Auth-Token-Lifetime-RFC",
    author: "Dmitri Volkov",
    timestamp: `${LAST_SPRINT}T12:00:00Z`,
    body: `RFC: Auth Token Lifetime
Author: Dmitri Volkov
Status: Accepted

Problem: session tokens currently live for 30 days. A leaked token is usable for weeks.

Proposal: 15-minute access tokens with a refresh token valid for 7 days, rotated on each use. Dual-accept the old format for a two-week migration window, then hard cutoff.

Open risks:
- Mobile clients must handle mid-session expiry on the refresh path. This is the main implementation risk and is not yet verified.
- Rotation increases write load on the session store, which is why ENG-455 (Redis cluster migration) is a soft prerequisite.

Decision: accepted in the #eng-platform thread on ${LAST_SPRINT}.`,
    metadata: { doc_type: "rfc", status: "accepted" },
  },
];

/** Rendered into the ingested document so retrieval sees the attribution. */
export function renderRecord(record: SeedRecord): string {
  const header = [
    `Source: ${record.title}`,
    `System: ${record.provider}`,
    record.externalId ? `ID: ${record.externalId}` : null,
    `Author: ${record.author}`,
    `Date: ${record.timestamp}`,
    record.url ? `URL: ${record.url}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n\n${record.body}\n`;
}
