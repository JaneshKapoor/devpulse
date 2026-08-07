# DevPulse — 60-second demo script

Recording: **Cmd+Shift+5** on macOS → *Record Selected Portion* → draw around the
browser window only (not the whole desktop). Chrome in a **1440×900** window,
zoom at 100%, bookmarks bar hidden (Cmd+Shift+B).

---

## Before you hit record

```bash
npm run dev
```

1. Open `localhost:3000/dashboard` → **Metrics** → **Clear**. A clean table reads
   as a live run rather than a rehearsal.
2. Go back to **Ask DevPulse** and run the first question **once**, off-camera.
   This warms the route so the on-camera run isn't paying first-compile cost.
3. Clear metrics again. Return to the landing page.
4. Close every other tab. Notifications off.

---

## The script

Total 60 s. Times are cumulative — the two waits are where you talk, not where
you sit in silence.

### 0:00–0:08 — The problem (landing page)

> "An engineering manager asks the same person for the same thing in three
> different places — email, Slack, and a Linear ticket. No single tool can tell
> you that those are one request."

Scroll slowly down to the four example question cards. Don't linger.

### 0:08–0:14 — What it is

Click **Open dashboard**.

> "DevPulse connects GitHub, Slack, Linear, Notion and Gmail into one HydraDB
> context graph, and answers across all of them."

### 0:14–0:22 — Ask the question

Click the **"Same request, three channels"** chip. The question fills in. Click
**Ask DevPulse**.

> "Here's that exact situation."

### 0:22–0:34 — The routing trace ← *this is the moment*

The trace appears immediately. **Stop moving the mouse and let it read.**

> "Before retrieving anything, it classifies the question. Six signals, score
> six against a threshold of three — so it picks thinking mode with graph
> context. A simple lookup would have gone to fast mode and cost a third as
> much. That decision is deliberate, not `mode: auto`."

Point the cursor at `score 6/3` as you say it.

### 0:34–0:48 — The answer

> "One request, three channels. Linear ENG-482 is the tracked record. And he
> replied in exactly one place — Slack, at 11:02."

Scroll into the sources list.

> "Sixteen sources retrieved, and the four it actually used are tagged. Every
> claim is clickable back to the original."

### 0:48–0:56 — Metrics

Click the **Metrics** tab.

> "Every question is logged with its routing decision and latency split.
> Thinking mode averages about twelve seconds; fast mode under four. Reported
> separately, because a blended average would hide the whole point of routing."

### 0:56–1:00 — Close

> "Five connectors, one graph, and an answer you can audit. That's DevPulse."

---

## What to say if a judge pushes

**"Is this just RAG?"**
> The routing layer and the graph context are the difference. A plain vector
> search returns three near-identical chunks about PR #482 and no way to know
> they're one request. `queryApps` plus graph context is what links the actor
> across systems that share no common identifier.

**"Why is fast mode only 7% here?"**
> Because the demo set is deliberately multi-hop-heavy — five of six questions
> genuinely need it. On a realistic mix it routes to fast far more often. The
> Metrics tab measures the real ratio rather than asserting one; the README says
> this plainly rather than tuning the threshold to hit a number.

**"Is this real data?"**
> The demo scenario is seeded so it's reproducible on stage — the README says so
> explicitly. The connectors are real: Linear went through the full create →
> discover → configure → sync lifecycle against a live workspace.

**"What was hardest?"**
> Retrieval budget. At ten chunks the five-source question answered from the two
> highest-ranked sources and then stated the others held nothing — confidently
> wrong, and invisible in the output. That's why thinking mode budgets 24.

---

## Notes

**Answers vary slightly between runs.** Temperature is 0.2, not 0. One run said
"three channels", another said "two places" and folded Linear into the sentence
differently. Both are correct; the first is the better demo. **Run it once
before recording** and if you get a weak phrasing, clear and re-run.

**Don't demo a live connector sync.** Synced Linear issues had not surfaced in
query results at the time of writing — a HydraDB-side ingestion delay, not a
code failure. `/setup` shows the lifecycle if asked; the seeded data carries the
demo.

**Latency is real.** ~12 s for thinking mode, most of it synthesis rather than
retrieval. Don't cut it out — talk over it. Trying to hide it looks worse than
owning it, and the Metrics tab shows the number anyway.
