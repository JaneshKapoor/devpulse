"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, RefreshCw, Trash2 } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderIcon } from "@/components/ProviderIcon";
import type { MetricsSummary, QueryMetric } from "@/lib/types";
import { cn, formatCost, formatLatency, truncate } from "@/lib/utils";

export function MetricsTable({ version }: { version: number }) {
  const [metrics, setMetrics] = useState<QueryMetric[]>([]);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/metrics");
      const payload = await response.json();
      if (!payload?.success) {
        setError(payload?.error ?? `Request failed (${response.status})`);
        return;
      }
      setMetrics(payload.data.metrics ?? []);
      setSummary(payload.data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // `version` is bumped by the dashboard whenever a query completes, so
  // switching to this tab always shows current data.
  useEffect(() => {
    void load();
  }, [load, version]);

  const clear = useCallback(async () => {
    await fetch("/api/metrics", { method: "DELETE" });
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Query metrics</h2>
          <p className="text-xs text-muted-foreground">
            Every question this session, with the routing decision and observed
            latency behind it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={loading || !metrics.length}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        summary && <SummaryCards summary={summary} />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not load metrics</AlertTitle>
          <AlertDescription className="break-anywhere">{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {loading && !metrics.length ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : !metrics.length ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No queries logged yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask a question on the Ask DevPulse tab and it will appear here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Question</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                  <TableHead className="text-right">HydraDB</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="min-w-[240px]">Answer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric) => {
                  const isOpen = expanded === metric.id;
                  return (
                    <TableRow key={metric.id}>
                      <TableCell>
                        <div className="break-anywhere text-sm">
                          {metric.question}
                        </div>
                        <div
                          className="mt-1 break-anywhere text-[11px] text-muted-foreground"
                          title={metric.routingRationale}
                        >
                          {truncate(metric.routingRationale, 90)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            metric.mode === "thinking" ? "pulse" : "default"
                          }
                        >
                          {metric.mode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatLatency(metric.latencyMs)}
                        <div className="text-[10px] text-muted-foreground">
                          {formatLatency(metric.retrievalMs)} +{" "}
                          {formatLatency(metric.synthesisMs)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {metric.hydraCalls}
                        <div className="text-[10px] text-muted-foreground">
                          {metric.chunksRetrieved} chunks
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {metric.sourcesHit.length ? (
                            metric.sourcesHit.map((source) => (
                              <span
                                key={source}
                                title={source}
                                className="inline-flex"
                              >
                                <ProviderIcon provider={source} />
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            metric.confidence === "high"
                              ? "success"
                              : metric.confidence === "medium"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {metric.confidence}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : metric.id)}
                          className="w-full text-left"
                        >
                          <span className="break-anywhere text-xs text-muted-foreground">
                            {isOpen ? metric.answer : truncate(metric.answer, 110)}
                          </span>
                          <span className="mt-1 flex items-center gap-1 text-[10px] text-pulse">
                            {isOpen ? "Collapse" : "Expand"}
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 transition-transform",
                                isOpen && "rotate-180"
                              )}
                            />
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The headline numbers. Fast and thinking latency are shown side by side
 * because the blended average hides exactly the tradeoff this tab exists to
 * demonstrate.
 */
function SummaryCards({ summary }: { summary: MetricsSummary }) {
  const fastTarget = summary.fastPercentage >= 60;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Answered in fast mode"
        value={`${summary.fastPercentage}%`}
        detail={`${summary.fastCount} fast · ${summary.thinkingCount} thinking`}
        accent={fastTarget ? "good" : "warn"}
        footnote={fastTarget ? "at or above 60% target" : "below 60% target"}
      />
      <StatCard
        label="Avg latency"
        value={formatLatency(summary.avgLatencyMs)}
        detail={`fast ${formatLatency(summary.avgFastLatencyMs)} · thinking ${formatLatency(summary.avgThinkingLatencyMs)}`}
        footnote="end to end, including synthesis"
      />
      <StatCard
        label="Avg HydraDB calls"
        value={summary.avgHydraCalls.toFixed(1)}
        detail={`${summary.total} question${summary.total === 1 ? "" : "s"} logged`}
        footnote="per question"
      />
      <StatCard
        label="Est. total cost"
        value={formatCost(summary.totalCostUsd)}
        detail={`${summary.highConfidencePercentage}% high confidence`}
        footnote="Fireworks tokens, blended rate"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  footnote,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  footnote: string;
  accent?: "good" | "warn";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl font-semibold tabular-nums",
            accent === "good" && "text-emerald-400",
            accent === "warn" && "text-amber-400"
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">{footnote}</p>
      </CardContent>
    </Card>
  );
}
