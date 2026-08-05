"use client";

import { Fragment, useCallback, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, Sunrise } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderIcon, providerLabel } from "@/components/ProviderIcon";
import type { AnswerMeta, AnswerSource } from "@/lib/types";
import { formatCost, formatLatency } from "@/lib/utils";

interface StandupSection {
  id: string;
  heading: string;
  mode: string;
  chunks: number;
  error: string | null;
}

interface StandupPayload {
  brief: string;
  confidence: "high" | "medium" | "low";
  sources: AnswerSource[];
  sections: StandupSection[];
  meta: AnswerMeta;
}

export function StandupBrief({ onGenerated }: { onGenerated?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StandupPayload | null>(null);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/standup", { method: "POST" });
      const payload = await response.json();

      if (!payload?.success) {
        setError(payload?.error ?? `Request failed (${response.status})`);
        return;
      }

      setData(payload.data as StandupPayload);
      onGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }, [onGenerated]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Today&apos;s standup</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Four retrievals run in parallel — shipped work, ticket movement
                and discussion on fast mode, blockers on thinking mode because
                only that leg needs to link a blocked ticket to the conversation
                explaining it — then synthesised into one brief.
              </CardDescription>
            </div>
            <Button onClick={generate} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sunrise className="h-4 w-4" />
              )}
              {busy ? "Generating…" : "Generate today's standup"}
            </Button>
          </div>
        </CardHeader>

        {data && (
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.sections.map((section) => (
                <Badge
                  key={section.id}
                  variant={
                    section.error
                      ? "destructive"
                      : section.mode === "thinking"
                        ? "pulse"
                        : "default"
                  }
                  title={section.error ?? undefined}
                >
                  {section.heading}: {section.error ? "failed" : `${section.chunks} chunks`} ·{" "}
                  {section.mode}
                </Badge>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {busy && <BriefSkeleton />}

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not generate the standup brief</AlertTitle>
          <AlertDescription className="break-anywhere">{error}</AlertDescription>
        </Alert>
      )}

      {data && !busy && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Brief</CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    data.confidence === "high"
                      ? "success"
                      : data.confidence === "medium"
                        ? "warning"
                        : "destructive"
                  }
                >
                  {data.confidence} confidence
                </Badge>
                <Badge variant="outline">
                  {formatLatency(data.meta.latencyMs)}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <BriefBody text={data.brief} />

            {data.sources.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Sources ({data.sources.length})
                  </h4>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {data.sources.map((source, index) => (
                      <li
                        key={`${source.title}-${index}`}
                        className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                      >
                        <ProviderIcon
                          provider={source.provider ?? source.collection}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {source.title}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {providerLabel(source.provider ?? source.collection)}
                        </span>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-pulse"
                            aria-label={`Open ${source.title}`}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            <Separator />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <Stat label="Total" value={formatLatency(data.meta.latencyMs)} />
              <Stat
                label="Retrieval (parallel)"
                value={formatLatency(data.meta.retrievalMs)}
              />
              <Stat label="HydraDB calls" value={String(data.meta.hydraCalls)} />
              <Stat
                label="Est. cost"
                value={formatCost(data.meta.estimatedCostUsd)}
              />
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[11px]">{value}</dd>
    </div>
  );
}

/**
 * Renders the model's markdown-ish output: headings, bullets and inline
 * [Source: …] citations. Deliberately not a full markdown parser — the brief
 * only ever uses these three constructs.
 */
function BriefBody({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1.5" />;

        const heading = trimmed.match(/^(?:#{1,4}\s*|\*\*)(.+?)(?:\*\*)?:?\s*$/);
        const isHeading =
          /^#{1,4}\s/.test(trimmed) ||
          (/^\*\*.+\*\*:?$/.test(trimmed) && trimmed.length < 60) ||
          /^\d+\.\s*\*\*/.test(trimmed);

        if (isHeading && heading) {
          return (
            <h4
              key={index}
              className="pt-3 text-xs font-semibold uppercase tracking-wider text-pulse"
            >
              {heading[1].replace(/\*\*/g, "").replace(/^\d+\.\s*/, "")}
            </h4>
          );
        }

        const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="break-anywhere">
                <Cited text={bullet[1]} />
              </span>
            </div>
          );
        }

        return (
          <p key={index} className="break-anywhere">
            <Cited text={trimmed} />
          </p>
        );
      })}
    </div>
  );
}

function Cited({ text }: { text: string }) {
  const parts = text.split(/(\[Source:[^\]]+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[Source:\s*([^\]]+)\]$/);
        if (!match) {
          return <Fragment key={index}>{part.replace(/\*\*/g, "")}</Fragment>;
        }
        return (
          <span
            key={index}
            className="mx-0.5 inline-flex items-center rounded border border-pulse/30 bg-pulse/10 px-1.5 py-0.5 align-baseline text-[11px] text-pulse"
          >
            {match[1].trim()}
          </span>
        );
      })}
    </>
  );
}

function BriefSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
        <div className="h-2" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </CardContent>
    </Card>
  );
}
