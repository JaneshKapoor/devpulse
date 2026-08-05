/**
 * Query metrics log.
 *
 * Every question DevPulse answers is recorded here: routing decision, observed
 * latency, HydraDB call count, sources hit and the answer. The Metrics tab
 * reads it directly — it is the app's answer to "how far can you push fast mode
 * without sacrificing accuracy".
 *
 * Storage is a JSON file with an in-memory fallback. That combination is
 * deliberate: a hackathon project does not need Postgres, but serverless
 * filesystems are read-only (and per-instance ephemeral even when writable), so
 * a file-only store would throw on Vercel. Writes degrade to memory instead of
 * failing the request that produced them — losing a metrics row must never cost
 * the user their answer.
 *
 * Server-only.
 */

import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { MetricsSummary, QueryMetric } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const METRICS_FILE = path.join(DATA_DIR, "metrics.json");
const MAX_ENTRIES = 500;

/** Survives between requests within one warm server process. */
let memoryLog: QueryMetric[] = [];
let fileWritable: boolean | null = null;

async function readFile(): Promise<QueryMetric[]> {
  try {
    const raw = await fs.readFile(METRICS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueryMetric[]) : [];
  } catch {
    // Missing or corrupt file is an empty log, not an error.
    return [];
  }
}

async function writeFile(entries: QueryMetric[]): Promise<boolean> {
  if (fileWritable === false) return false;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(METRICS_FILE, JSON.stringify(entries, null, 2), "utf8");
    fileWritable = true;
    return true;
  } catch {
    // Read-only filesystem (Vercel) — fall back to memory for the rest of
    // this process's life rather than retrying on every request.
    fileWritable = false;
    return false;
  }
}

export async function recordMetric(
  metric: Omit<QueryMetric, "id" | "timestamp"> &
    Partial<Pick<QueryMetric, "id" | "timestamp">>
): Promise<QueryMetric> {
  const entry: QueryMetric = {
    id: metric.id ?? cryptoRandomId(),
    timestamp: metric.timestamp ?? new Date().toISOString(),
    ...metric,
  } as QueryMetric;

  const existing = await listMetrics();
  // Newest first, capped so the file cannot grow without bound.
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);

  memoryLog = next;
  await writeFile(next);

  return entry;
}

export async function listMetrics(): Promise<QueryMetric[]> {
  if (fileWritable === false) return memoryLog;

  const fromFile = await readFile();
  // Prefer whichever source has more history — after a cold start the file
  // wins; on a read-only filesystem memory does.
  return fromFile.length >= memoryLog.length ? fromFile : memoryLog;
}

export async function clearMetrics(): Promise<void> {
  memoryLog = [];
  await writeFile([]);
}

/**
 * Summary stats for the cards above the metrics table.
 *
 * Fast and thinking latencies are averaged separately — the blended number
 * hides the tradeoff the dashboard exists to show.
 */
export function summarise(entries: QueryMetric[]): MetricsSummary {
  const total = entries.length;
  if (!total) {
    return {
      total: 0,
      fastCount: 0,
      thinkingCount: 0,
      fastPercentage: 0,
      avgLatencyMs: 0,
      avgFastLatencyMs: 0,
      avgThinkingLatencyMs: 0,
      avgHydraCalls: 0,
      totalCostUsd: 0,
      highConfidencePercentage: 0,
    };
  }

  const fast = entries.filter((e) => e.mode === "fast");
  const thinking = entries.filter((e) => e.mode === "thinking");
  const mean = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

  return {
    total,
    fastCount: fast.length,
    thinkingCount: thinking.length,
    fastPercentage: Math.round((fast.length / total) * 100),
    avgLatencyMs: Math.round(mean(entries.map((e) => e.latencyMs))),
    avgFastLatencyMs: Math.round(mean(fast.map((e) => e.latencyMs))),
    avgThinkingLatencyMs: Math.round(mean(thinking.map((e) => e.latencyMs))),
    avgHydraCalls:
      Math.round(mean(entries.map((e) => e.hydraCalls)) * 10) / 10,
    totalCostUsd: entries.reduce((sum, e) => sum + (e.estimatedCostUsd || 0), 0),
    highConfidencePercentage: Math.round(
      (entries.filter((e) => e.confidence === "high").length / total) * 100
    ),
  };
}

function cryptoRandomId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
