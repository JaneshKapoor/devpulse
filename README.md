# DevPulse

**An AI engineering intelligence agent that answers cross-source questions about a software team.**

DevPulse connects GitHub, Slack, Linear, Notion and Gmail into a single [HydraDB](https://hydradb.com) context graph, then answers questions that no one of those tools can answer alone — grounded, cited, and with the retrieval cost of every answer on display.

> Built for the HydraDB × Connectors Hackathon.

---

## The problem

Ask any of these in a single tool and you get nothing useful:

| Question | Why one tool can't answer it |
|---|---|
| *"Who filed BUG-123, which project are they working on, and what did they say about the fix in Slack?"* | Three hops across two systems that share no identifier. |
| *"The manager messaged Janesh about the auth PR on Gmail, Slack and Linear today — which is the source of truth, and has he responded anywhere?"* | One logical request duplicated across three systems; the reply is in only one of them. |
| *"What did the team decide about the auth refactor in Slack, and has anyone started implementing it in GitHub?"* | Links a conversational decision to code activity. |
| *"What was blocked last sprint that is still blocked this sprint?"* | Temporal comparison — two states must be retrieved and diffed. |

DevPulse answers all four. Every claim cites the record it came from.

---

## Architecture

```
                        ┌──────────────────────────────────────┐
                        │           Browser (Next.js)          │
                        │                                      │
                        │  /            landing                │
                        │  /setup       connector wizard       │
                        │  /upload      document ingestion     │
                        │  /dashboard   Standup · Ask · Metrics│
                        └───────────────────┬──────────────────┘
                                            │  fetch (no secrets client-side)
                        ┌───────────────────▼──────────────────┐
                        │      Next.js API routes (server)     │
                        │                                      │
                        │  /api/connectors/*  lifecycle        │
                        │  /api/ingest        document upload  │
                        │  /api/ask           core Q&A         │
                        │  /api/standup       parallel brief   │
                        │  /api/metrics       query log        │
                        └──────┬────────────────────┬──────────┘
                               │                    │
              ┌────────────────▼─────────┐  ┌───────▼──────────────┐
              │         HydraDB          │  │     Fireworks AI     │
              │                          │  │                      │
              │  database: devpulse_team │  │  synthesis + citation│
              │  ├── collection github   │  │  JSON mode with      │
              │  ├── collection slack    │  │  plain-text fallback │
              │  ├── collection linear   │  └──────────────────────┘
              │  ├── collection notion   │
              │  ├── collection gmail    │
              │  └── collection docs     │
              │                          │
              │  fast / thinking mode    │
              │  + context graph         │
              └──────────────────────────┘
```

### The request path for one question

```
question
   │
   ├─▶ classifyQueryComplexity()      ← lib/query-router.ts
   │     scores 6 signals, picks fast or thinking, records why
   │
   ├─▶ queryHydra()                   ← lib/hydradb.ts
   │     mode + queryApps + graphContext (thinking only)
   │     measures latency and call count
   │
   ├─▶ synthesizeAnswer()             ← lib/fireworks.ts
   │     grounded prompt, inline [Source: …] citations
   │
   ├─▶ recordMetric()                 ← lib/metrics-store.ts
   │
   └─▶ answer + sources + full metadata strip
```

---

## Quick start

### 1. Install

```bash
git clone https://github.com/JaneshKapoor/devpulse.git
cd devpulse
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env.local
```

`.env.local` is gitignored and must never be committed. Fill in at minimum:

| Variable | Required | Where to get it |
|---|---|---|
| `HYDRA_DB_API_KEY` | **yes** | [app.hydradb.com](https://app.hydradb.com) |
| `FIREWORKS_API_KEY` | **yes** | [Fireworks API keys](https://app.fireworks.ai/settings/users/api-keys) |
| `FIREWORKS_MODEL_ID` | **yes** | run `npm run list-models` (see below) |
| `GITHUB_CONNECTOR_TOKEN` + `GITHUB_ORG_OR_USER` | for GitHub | PAT with `repo` + `read:org` — [settings/tokens](https://github.com/settings/tokens) |
| `SLACK_CONNECTOR_TOKEN` + `SLACK_WORKSPACE_ID` | for Slack | Token with `channels:history`, `channels:read`, `users:read` — [api.slack.com/apps](https://api.slack.com/apps) |
| `LINEAR_CONNECTOR_TOKEN` | for Linear | Linear → Settings → API |
| `NOTION_CONNECTOR_TOKEN` | for Notion | [notion.so/my-integrations](https://www.notion.so/my-integrations) — remember to *share* pages with the integration |
| `GMAIL_CONNECTOR_TOKEN` + `GMAIL_ACCOUNT_EMAIL` | for Gmail | OAuth token with `gmail.readonly` |

Fireworks' serverless catalogue changes often, so don't guess the model ID:

```bash
npm run list-models
```

This prints the models your account can actually call. Paste one into `FIREWORKS_MODEL_ID`.

### 3. Provision the HydraDB database

```bash
npm run setup:hydradb
```

Creates the database and **blocks until `infra.readyForIngestion` is true** — provisioning is asynchronous, and ingesting before it completes fails in confusing ways. Safe to re-run.

### 4. Run

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000) → **Connectors** → connect each source.

### 5. (Optional) Seed the demo scenario

```bash
npm run seed:demo
```

Guarantees the hard questions work live even if your real workspace has no such pattern today. See [Demo data](#demo-data) for exactly what this does and doesn't claim.

---

## Using it

### Connectors (`/setup`)

Each provider walks the full HydraDB lifecycle, with a visible status per stage:

```
create ──▶ discover ──▶ configure ──▶ sync
```

- **discover** lists what the account can see and pages through the cursor, so a workspace with more than 100 channels isn't silently truncated at one page.
- **configure** activates the resources you tick, with `lookbackDays: 30`.
- **sync** is triggered explicitly. The scheduler's default is hourly, which is unusable during a demo, so configure chains straight into a sync and every connector gets a **Sync now** button.

Missing credentials render inline, naming the exact env var to set.

### Documents (`/upload`)

A **separate ingestion path** from connectors: one-time file upload (PDF / Markdown / text / DOCX) into the `docs` collection. Connectors sync continuously; this doesn't. Both land in the same database, so one question can span a written spec *and* live Slack activity.

Indexing is asynchronous, so the page polls until each document reports terminal status before inviting you to query it.

### Dashboard (`/dashboard`)

**Standup Brief** — four narrow retrievals run in parallel rather than one broad question. Each gets the cheapest mode that can answer it; only the blockers leg pays for thinking mode, because only it needs to link a blocked ticket to the conversation explaining it. The brief costs roughly its slowest leg, not their sum. One failing leg degrades the brief instead of losing it.

**Ask DevPulse** — free-text input plus six one-click chips covering the hard cases. Shows a live trace (routing → retrieval → synthesis), then the answer with inline citations, a Sources panel marking which sources were actually cited, and a metadata strip.

**Metrics** — every question logged with its routing decision, latency split, HydraDB call count and sources hit.

---

## Fast mode vs thinking mode

The hackathon asks *how far you can push fast mode without sacrificing accuracy*. DevPulse answers that deliberately: it **classifies every question before touching HydraDB** rather than delegating to `mode: "auto"`.

`lib/query-router.ts` scores six signals:

| Signal | Weight | Fires when |
|---|---|---|
| `multi_source` | 3 | Two or more providers named |
| `multi_hop_phrasing` | 2–3 | "source of truth", "has anyone", "and where", … |
| `compound_question` | 2 | Two or more question words in one ask |
| `ticket_reference` | 1–2 | A ticket ID, weighted higher alongside another entity |
| `temporal_comparison` | 2 | "still", "last sprint", "this sprint", … |
| `multi_clause` | 1 | Three or more clauses |

Score **≥ 3 → thinking mode** (with `graphContext`), otherwise **fast mode**. Thinking mode costs real latency, so it's spent only where a second logical hop is genuinely required.

The classifier returns *its reasons* alongside the decision. Those reasons drive the live trace and the Metrics table — a routing rule that can't be explained to a judge isn't worth having.

Regression-tested:

```bash
npm run test:router
# 13/13 passed
```

---

## Hackathon submission

### Deliverables

| Requirement | Status |
|---|---|
| 3+ working connectors | **5 implemented** — GitHub, Slack, Linear, Notion, Gmail. Linear taken through the full create → discover → configure → sync lifecycle live (see below). |
| Document ingestion | `/upload` → `POST /context/ingest`, `type=knowledge`, `docs` collection |
| Difficult cross-source questions | 6 pre-seeded, 5 multi-hop (below) |
| Expected vs actual answers | Table below — from a real run |
| Latency / accuracy results | Metrics tab + table below |
| 60-second demo | *(video link to be added)* |

**Connector lifecycle, verified live (Linear).** Every stage returned success:
connector created and `active`, discovery returned the workspace team,
configuration accepted it with a 30-day lookback, and sync was accepted.

The one honest caveat: at the time of writing, the synced Linear issues had not
yet appeared in query results — the workspace contains four issues (confirmed
directly against Linear's GraphQL API with the same token), the connector
reports `active`, but indexing had not surfaced them. That is a HydraDB-side
ingestion delay, not a failure in this code path; the same query returns the
seeded `linear` records correctly. Worth re-checking before relying on a live
sync in a demo.

### Hard questions — expected vs actual

Run these from the chips on the Ask tab. The **Actual** column below is from a
real run on 2026-08-07 against the seeded demo data, with
`gpt-oss-120b` on Fireworks.

| # | Question | Routed | Sources expected | Expected answer | Actual |
|---|---|---|---|---|---|
| 1 | What has the manager asked Janesh to do today, across which channels, and where has he responded? | thinking | Gmail, Slack, Linear | One request — review PR #482 — duplicated across all three. **Linear ENG-482 is the record of truth** (stated as such in the email itself). Responded **only in Slack** at 11:02, flagging the mobile refresh path. No Gmail reply, no Linear comment. | ✅ Correct. Named all three channels, identified the Slack 11:02 reply as the only response. 13.0 s, 16 chunks, high confidence. |
| 2 | Who filed BUG-123, which project are they working on, and what did they say about the fix in Slack? | thinking | Linear, Slack | Filed by **Arjun Mehta**, project **Checkout Reliability** (Payments team). In `#payments` he said the fix is moving idempotency key generation from per-attempt to per-checkout-session. | ✅ Correct on all three hops, quoting the `#payments` message verbatim. 15.8 s, 16 chunks, high confidence. |
| 3 | What did the team decide about the auth refactor in Slack, and has anyone started implementing it in GitHub? | thinking | Slack, GitHub | Decision: short-lived 15-minute tokens plus refresh, two-week dual-accept window, Dmitri to implement. **Yes** — PR #482 implements it, currently open awaiting Janesh's review. | ✅ Correct, including the two-week dual-accept window and the link to PR #482. 9.0 s, high confidence. |
| 4 | What was blocked last sprint that is still blocked this sprint? | thinking | Linear, Slack | **ENG-455** (Redis cluster migration), blocked on INFRA-88 for two weeks and still blocked. ENG-470 was blocked last sprint but is now done — should be excluded. | ✅ Correct. Named ENG-455 only; correctly excluded the since-unblocked ENG-470. 8.9 s, high confidence. |
| 5 | Which pull requests are waiting on review, and has anyone flagged them in Slack? | thinking | GitHub, Slack | PR #481 (needs Dmitri) and PR #482 (needs Janesh). Sofia flagged both in `#eng-platform`, noting they block the Thursday cut. | ✅ Correct on both PRs, both reviewers, and the Slack nudge. 10.7 s, high confidence. |
| 6 | What did the team ship this week? | **fast** | GitHub | PR #479 (idempotency keys, fixes BUG-123) and PR #476 (rate limiter, ENG-470), both merged. Single-hop — demonstrates the router keeping easy questions cheap. | ⚠️ Partially correct. Reported the shipped rate-limiting feature via ENG-470 but answered from Linear rather than naming the two merged PRs. Fast mode's narrower budget is the tradeoff being demonstrated. **4.7 s** — roughly a third of the thinking-mode latency. |

**Why question 1 is the interesting one:** the useful answer isn't *what* was asked — all three channels say the same thing. It's *"this is one request, not three; here is the tracked record; here is the single place he actually replied."* That's reasoning a per-tool search cannot do at all.

### Latency / accuracy

Measured server-side around each call and recorded per question. Live numbers
are on the **Metrics** tab; this is the run above.

| Metric | Result |
|---|---|
| Accuracy on the 6 demo questions | 5 fully correct, 1 partially correct (Q6) |
| Avg latency — thinking mode | **11.5 s** (5 questions, 8.9–15.8 s) |
| Avg latency — fast mode | **4.7 s** — reported separately, because a blended average hides exactly the tradeoff the router exists to make |
| Standup Brief | **19.0 s** for 4 retrievals + synthesis, run in parallel |
| HydraDB calls per question | 1 per Ask; 4 per Standup Brief |
| Chunks retrieved | 16 thinking / 10 fast |

Latency is dominated by synthesis, not retrieval — HydraDB returns in roughly
3 s, and the remainder is the model writing a cited multi-source answer.

> On the router's own regression suite, 5 of 10 representative questions stay on fast mode. That ratio is dominated by the demo set being deliberately multi-hop-heavy; a realistic mix of day-to-day questions routes to fast mode far more often, which is what the Metrics tab measures live.

### Reproducibility

Everything is one command:

```bash
npm install
cp .env.example .env.local     # add keys
npm run setup:hydradb          # blocks until ready
npm run seed:demo              # optional, guarantees the demo
npm run dev
```

```bash
npm run test:router            # routing regression, no credentials needed
npm run typecheck              # clean
npm run lint                   # clean
npm run build                  # clean
```

---

## Demo data

`npm run seed:demo` ingests ~16 records covering the featured scenario and every example chip.

**To be precise about what this is:** seeded records are ingested as `knowledge` documents into the collection matching their provider (Slack records → `slack`, and so on) and tagged with provider metadata, so the UI attributes and links them exactly as it would connector-synced data. It is **not** simulating a connector sync, and it does not replace the real connectors — those remain the primary path. It exists so the hard cross-source questions demo reliably even when the presenter's live workspace has no such pattern on the day.

Everything in it is fictional: `example/platform`, `example.slack.com`, and invented teammates.

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

Add every variable from `.env.example` under **Project → Settings → Environment Variables**. `vercel.json` already raises `maxDuration` to 60s for the LLM-backed routes (`/api/ask`, `/api/standup`, `/api/ingest`).

**One caveat:** the metrics log writes to `data/metrics.json`, and serverless filesystems are read-only. `lib/metrics-store.ts` detects this and falls back to an in-memory log — metrics stay correct within a warm instance but don't persist across cold starts. For a hackathon demo that's the right trade; for production, swap the store for Postgres or KV. The interface is three functions, so it's a contained change.

---

## Project layout

```
app/
├── page.tsx                     landing — spotlight hero, animated reveal
├── setup/page.tsx               connector wizard
├── upload/page.tsx              document ingestion
├── dashboard/page.tsx           3 tabs
└── api/
    ├── connectors/route.ts              GET readiness · POST create
    ├── connectors/[id]/discover|configure|sync|status
    ├── ingest/route.ts                  POST upload · GET index status
    ├── ask/route.ts                     core Q&A
    ├── standup/route.ts                 parallel brief
    └── metrics/route.ts                 GET log · DELETE reset

components/
├── ui/                          shadcn primitives + spotlight, text-reveal
├── ConnectorCard.tsx            per-provider lifecycle card
├── AskDevPulse.tsx              input, chips, live trace
├── AnswerCard.tsx               answer + citations + metadata strip
├── StandupBrief.tsx             brief renderer
└── MetricsTable.tsx             table + summary stat cards

lib/
├── hydradb.ts                   client + normalised query surface (server-only)
├── connectors.ts                per-provider lifecycle (server-only)
├── documents.ts                 document ingestion (server-only)
├── fireworks.ts                 synthesis + JSON-mode fallback (server-only)
├── query-router.ts              classifyQueryComplexity — pure, testable
├── metrics-store.ts             JSON log with in-memory fallback (server-only)
├── types.ts                     shapes shared with client components
├── example-questions.ts         the hard questions
├── demo-scenario.ts             seed dataset
├── api.ts                       shared response envelope + Zod helpers
└── env.ts                       lazy, typed env access

scripts/
├── setup-hydradb.ts             provision + poll until ready
├── seed-demo-scenario.ts        ingest demo dataset
├── list-fireworks-models.ts     print callable model IDs
└── test-router.ts               routing regression
```

---

## Implementation notes

Things that are easy to get wrong against this stack, recorded because they cost real debugging time:

**The SDK namespace is `databases`, not `tenants`.** `@hydradb/sdk@2.1.2` exposes `databases`, `connectors`, `context` and `webhooks`. "Tenant" is the deprecated name for a database and survives only as request-field aliases.

**SDK request fields are camelCase.** The SDK serialises to snake_case itself. Writing `query_apps` or `max_results` does not error — it is silently dropped, quietly degrading retrieval. Always `queryApps`, `maxResults`, `graphContext`, `lookbackDays`, `providerAccountScope`.

**`documentMetadata` is a JSON-encoded *array*, and each entry is a fixed envelope.** One entry per document, even when uploading a single file. The entry accepts only `additional_metadata`, `document_metadata`, `file_id`, `id`, `infer`, `metadata`, `relations` and `source_id` — anything else is a 400. Your own fields go under `additional_metadata`, which is where they come back on query as `additionalMetadata`.

**Queries must name their collections explicitly.** Omitting `collections` does not search everything — it searches *nothing* and returns zero chunks with no error, which is indistinguishable from an empty workspace. Naming a collection that does not exist yet is a hard 400 (`sub_tenant_ids do not exist`), and a collection only exists once something has been ingested into it. `queryHydra` therefore resolves scope against `databases.collections()` on every query, cached for 30 s.

**Retrieved titles and URLs live in metadata, not on the source.** `sourceTitle` is the stored filename (`ENG-482.md`) and `source.url` is an internal `s3://` object path. The human title and real permalink are the ones you ingested under `additional_metadata`. Cite from those, and accept only `http(s)` URLs so a storage path can never reach the UI.

**Prefer a non-reasoning model for synthesis.** A reasoning model spends the token budget narrating its working, then truncates mid-JSON — so the envelope never closes and the raw `{"answer":"…` leaks to the user. The parser now strips reasoning, scans for the *last* balanced JSON object, and salvages the answer string from a truncated envelope; but the cheaper fix is choosing a model that just answers.

**Gmail has no `provider_account_scope`.** Every other provider gets a workspace or org identifier to keep connectors from colliding; Gmail carries its account email in `additional_metadata.account_email` instead, and authenticates via OAuth rather than an API token.

**`server-only` throws under plain Node.** The scripts import `lib/hydradb.ts`, so they run with `--conditions=react-server`, which resolves `server-only` to its empty module — keeping the guard intact for the Next build without breaking CLI usage.

**Database creation is asynchronous.** Poll `databases.status()` until `infra.readyForIngestion` before ingesting or querying.

**Next.js 14.2.35** is the latest 14.x patch. `npm audit` reports advisories whose fixed ranges extend past 14.x, so staying on the pinned major means inheriting them. They are predominantly denial-of-service and cache-poisoning issues affecting self-hosted configurations. Worth knowing before deploying this beyond a demo.

---

## License

MIT
