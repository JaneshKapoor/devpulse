"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Search, Sparkles } from "lucide-react";

import { AnswerCard } from "@/components/AnswerCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EXAMPLE_QUESTIONS } from "@/lib/example-questions";
import { classifyQueryComplexity } from "@/lib/query-router";
import type { AskAnswer } from "@/lib/types";
import { cn } from "@/lib/utils";

type TraceState = "pending" | "active" | "done";

interface TraceStep {
  id: string;
  label: string;
  state: TraceState;
}

export function AskDevPulse({ onAnswered }: { onAnswered?: () => void }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (answer) answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [answer]);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3 || busy) return;

      setBusy(true);
      setError(null);
      setAnswer(null);

      // The routing decision is computed client-side purely to narrate it
      // instantly. The server re-runs the same pure classifier and its result
      // is authoritative — this is display, not control flow.
      const decision = classifyQueryComplexity(trimmed);

      setTrace([
        {
          id: "route",
          label: `Routing: ${decision.mode} mode — ${decision.rationale}`,
          state: "done",
        },
        {
          id: "retrieve",
          label:
            decision.mode === "thinking"
              ? "Querying HydraDB (thinking mode, graph context on)…"
              : "Querying HydraDB (fast mode)…",
          state: "active",
        },
        { id: "synthesize", label: "Synthesizing answer…", state: "pending" },
      ]);

      // Retrieval finishes before synthesis begins server-side, but the
      // response arrives as one unit, so advance the trace on a timer to keep
      // the stages legible rather than flashing all at once.
      const advance = setTimeout(() => {
        setTrace((prev) =>
          prev.map((step) =>
            step.id === "retrieve"
              ? { ...step, state: "done" }
              : step.id === "synthesize"
                ? { ...step, state: "active" }
                : step
          )
        );
      }, 900);

      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const payload = await response.json();

        clearTimeout(advance);

        if (!payload?.success) {
          setError(payload?.error ?? `Request failed (${response.status})`);
          setTrace([]);
          return;
        }

        const data = payload.data as AskAnswer;
        setAnswer(data);
        setTrace([
          {
            id: "route",
            label: `Routing: ${data.meta.mode} mode — ${data.meta.routingRationale}`,
            state: "done",
          },
          {
            id: "retrieve",
            label: `Retrieved ${data.meta.chunksRetrieved} chunks and ${data.meta.graphPathsUsed} graph relations in ${data.meta.retrievalMs}ms`,
            state: "done",
          },
          {
            id: "synthesize",
            label: `Synthesized in ${data.meta.synthesisMs}ms`,
            state: "done",
          },
        ]);
        onAnswered?.();
      } catch (err) {
        clearTimeout(advance);
        setError(err instanceof Error ? err.message : "Network error");
        setTrace([]);
      } finally {
        setBusy(false);
      }
    },
    [busy, onAnswered]
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Try a hard one
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((example) => (
            <button
              key={example.id}
              type="button"
              title={example.hardBecause}
              disabled={busy}
              onClick={() => {
                setQuestion(example.question);
                void ask(example.question);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
                example.featured
                  ? "border-pulse/40 bg-pulse/10 text-pulse hover:bg-pulse/20"
                  : "border-border text-muted-foreground hover:border-pulse/40 hover:text-foreground"
              )}
            >
              {example.featured && (
                <Sparkles className="mr-1 inline h-3 w-3 align-[-2px]" />
              )}
              {example.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter inserts a newline.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            placeholder="Ask anything across GitHub, Slack, Linear, Notion and Gmail…"
            rows={3}
            disabled={busy}
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Enter to ask · Shift+Enter for a new line
            </p>
            <Button
              onClick={() => void ask(question)}
              disabled={busy || question.trim().length < 3}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {busy ? "Thinking…" : "Ask DevPulse"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {trace.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            {trace.map((step) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-2.5 text-xs",
                  step.state === "pending" && "opacity-40"
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {step.state === "done" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : step.state === "active" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />
                  ) : (
                    <span className="block h-3.5 w-3.5 rounded-full border border-border" />
                  )}
                </span>
                <span className="break-anywhere font-mono leading-relaxed">
                  {step.label}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not answer that question</AlertTitle>
          <AlertDescription className="break-anywhere">{error}</AlertDescription>
        </Alert>
      )}

      <div ref={answerRef}>{answer && <AnswerCard answer={answer} />}</div>
    </div>
  );
}
