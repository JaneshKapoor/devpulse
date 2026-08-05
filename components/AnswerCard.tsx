"use client";

import { Fragment } from "react";
import { ExternalLink, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProviderIcon, providerLabel } from "@/components/ProviderIcon";
import type { AskAnswer } from "@/lib/types";
import { cn, formatCost, formatLatency } from "@/lib/utils";

const CONFIDENCE_VARIANT = {
  high: "success",
  medium: "warning",
  low: "destructive",
} as const;

export function AnswerCard({ answer }: { answer: AskAnswer }) {
  const { meta } = answer;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Answer</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={meta.mode === "thinking" ? "pulse" : "default"}>
              {meta.mode} mode
            </Badge>
            <Badge variant={CONFIDENCE_VARIANT[answer.confidence]}>
              {answer.confidence} confidence
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="whitespace-pre-wrap text-sm leading-relaxed break-anywhere">
          <CitedText text={answer.answer} />
        </div>

        {answer.requiresFollowup && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              DevPulse flagged this answer as incomplete — the retrieved context
              did not fully cover the question.
            </span>
          </div>
        )}

        {answer.sources.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sources ({answer.sources.length})
              </h4>
              <ul className="space-y-1.5">
                {answer.sources.map((source, index) => {
                  const cited = answer.sourcesUsed.some(
                    (used) =>
                      used.toLowerCase().includes(source.title.toLowerCase()) ||
                      source.title.toLowerCase().includes(used.toLowerCase())
                  );
                  return (
                    <li
                      key={`${source.title}-${index}`}
                      className={cn(
                        "flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm",
                        cited
                          ? "border-pulse/25 bg-pulse/5"
                          : "border-border"
                      )}
                    >
                      <ProviderIcon
                        provider={source.provider ?? source.collection}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{source.title}</span>
                          {cited && (
                            <Badge variant="pulse" className="shrink-0 text-[10px]">
                              cited
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {providerLabel(source.provider ?? source.collection)}
                          </span>
                          {source.externalId && (
                            <span className="font-mono">{source.externalId}</span>
                          )}
                          {source.timestamp && (
                            <span>{formatTimestamp(source.timestamp)}</span>
                          )}
                        </div>
                      </div>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-pulse"
                          aria-label={`Open ${source.title}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        <Separator />

        {/* Metadata strip — the per-question evidence behind the Metrics tab. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <Stat label="Total latency" value={formatLatency(meta.latencyMs)} />
          <Stat
            label="Retrieval / synthesis"
            value={`${formatLatency(meta.retrievalMs)} / ${formatLatency(meta.synthesisMs)}`}
          />
          <Stat label="HydraDB calls" value={String(meta.hydraCalls)} />
          <Stat
            label="Chunks / graph paths"
            value={`${meta.chunksRetrieved} / ${meta.graphPathsUsed}`}
          />
          <Stat label="Est. cost" value={formatCost(meta.estimatedCostUsd)} />
          {meta.promptTokens !== undefined && (
            <Stat
              label="Tokens in / out"
              value={`${meta.promptTokens} / ${meta.completionTokens ?? 0}`}
            />
          )}
          <div className="col-span-2 sm:col-span-2">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="truncate font-mono text-[11px]" title={meta.model}>
              {meta.model.replace("accounts/fireworks/models/", "")}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
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

/** Renders [Source: X] markers as inline chips rather than raw brackets. */
function CitedText({ text }: { text: string }) {
  const parts = text.split(/(\[Source:[^\]]+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[Source:\s*([^\]]+)\]$/);
        if (!match) return <Fragment key={index}>{part}</Fragment>;
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
