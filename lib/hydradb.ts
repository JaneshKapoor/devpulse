/**
 * HydraDB client + typed helpers.
 *
 * Coded against @hydradb/sdk@2.1.2's actual type definitions. Two things about
 * that SDK are easy to get wrong and worth stating plainly:
 *
 *   1. The client exposes `databases`, `connectors`, `context` and `webhooks`.
 *      There is no `hydra.tenants` namespace — "tenant" is the deprecated name
 *      for what v2 calls a database, and it survives only as request-field
 *      aliases (`tenantId`, `subTenantId`).
 *
 *   2. Request fields are camelCase in TypeScript. The SDK serialises them to
 *      the snake_case wire format itself. Passing `query_apps` or `max_results`
 *      would not error — it would be silently dropped, quietly degrading
 *      retrieval. Always use `queryApps` / `maxResults` / `graphContext`.
 *
 * Server-only: this module reads secrets and must never be imported from a
 * "use client" component.
 */

/* eslint-disable @typescript-eslint/no-explicit-any --
 * This module is the adapter boundary for HydraDB responses. The SDK types
 * several endpoints as `Record<string, unknown>` and marks nearly every field
 * optional, so the normalise* helpers below deliberately probe untyped payloads
 * and convert them into the strict types this file exports. The `any` is
 * confined to those helpers; everything crossing out of this module is typed.
 */

import "server-only";

import { HydraDBClient } from "@hydradb/sdk";

import { HYDRA_API_VERSION, HYDRA_DATABASE, requireEnv } from "./env";
import type { RecallMode } from "./types";

let _client: HydraDBClient | null = null;

/**
 * Lazily constructed so that importing this module never throws — only the
 * routes that actually call HydraDB fail when the key is absent.
 */
export function hydra(): HydraDBClient {
  if (_client) return _client;
  _client = new HydraDBClient({
    token: requireEnv("HYDRA_DB_API_KEY"),
    apiVersion: HYDRA_API_VERSION(),
  });
  return _client;
}

// --- Types ------------------------------------------------------------------

export type { RecallMode };

export interface RetrievedChunk {
  id: string;
  content: string;
  sourceTitle: string;
  sourceType: string;
  collection: string;
  score: number;
  url?: string;
  lastUpdated?: string;
  /** Provider name for app-sourced chunks: slack, github, linear, notion, gmail. */
  provider?: string;
  metadata: Record<string, unknown>;
}

export interface RetrievedSource {
  id: string;
  title: string;
  url?: string;
  provider?: string;
  collection?: string;
  timestamp?: string;
  /** Provider-assigned id, e.g. a Slack channel ID or Linear issue key. */
  externalId?: string;
}

export interface GraphPath {
  /** Human-readable rendering of one relation path from the context graph. */
  description: string;
  score?: number;
}

export interface HydraQueryResult {
  chunks: RetrievedChunk[];
  sources: RetrievedSource[];
  graphPaths: GraphPath[];
  /** Wall-clock ms around the HydraDB call, measured client-side. */
  latencyMs: number;
  mode: RecallMode;
  /** Number of HTTP calls to HydraDB this result required. */
  apiCalls: number;
}

export interface QueryOptions {
  question: string;
  mode: RecallMode;
  maxResults?: number;
  /** Scope to specific collections, e.g. ["slack"] for a Slack-only question. */
  collections?: string[];
  metadataFilters?: Record<string, unknown>;
  /** Graph context is what makes multi-hop questions answerable. */
  graphContext?: boolean;
  additionalContext?: string;
}

// --- Normalisation ----------------------------------------------------------

/**
 * The SDK types nearly every field as optional, so the raw response is awkward
 * to consume in UI code. These helpers flatten it into a stable shape and are
 * the only place that has to care about HydraDB's wire quirks.
 */
function normaliseChunk(raw: Record<string, any>): RetrievedChunk {
  const additional = (raw.additionalMetadata ?? {}) as Record<string, unknown>;
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.chunkUuid ?? raw.id ?? ""),
    content: String(raw.chunkContent ?? ""),
    // `sourceTitle` is the stored filename ("ENG-482.md", "thread-a91f22.md"),
    // which is meaningless in a citation. The human title we ingested lives in
    // additional_metadata, so prefer it and keep the filename as the fallback.
    sourceTitle: pickTitle(additional, metadata) ?? String(raw.sourceTitle ?? "Untitled source"),
    sourceType: String(raw.sourceType ?? "unknown"),
    collection: String(raw.subTenantId ?? ""),
    score: typeof raw.relevancyScore === "number" ? raw.relevancyScore : 0,
    url: pickUrl(additional, metadata),
    lastUpdated: raw.sourceLastUpdatedTime
      ? String(raw.sourceLastUpdatedTime)
      : undefined,
    provider: pickProvider(additional, metadata, raw.sourceType),
    metadata: { ...metadata, ...additional },
  };
}

function normaliseSource(raw: Record<string, any>): RetrievedSource {
  const additional = (raw.additionalMetadata ?? {}) as Record<string, unknown>;
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id ?? ""),
    title: pickTitle(additional, metadata) ?? String(raw.title ?? "Untitled source"),
    // `raw.url` is the internal storage location (an `s3://` object path), not
    // somewhere a human can click. Metadata is checked first and only http(s)
    // links are accepted, so a storage path never reaches the UI.
    url: pickUrl(additional, metadata, raw),
    provider: raw.appProvider ? String(raw.appProvider) : pickProvider(additional, metadata),
    collection: raw.subTenantId ? String(raw.subTenantId) : undefined,
    timestamp: raw.timestamp ? String(raw.timestamp) : undefined,
    externalId: raw.appExternalId ? String(raw.appExternalId) : undefined,
  };
}

/** The human-readable title we ingested, as opposed to the stored filename. */
function pickTitle(...bags: Array<Record<string, unknown> | undefined>) {
  for (const bag of bags) {
    const value = bag?.title;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Different providers stash the permalink under different metadata keys.
 * Only http(s) values qualify — internal `s3://` storage paths are not links.
 */
function pickUrl(...bags: Array<Record<string, unknown> | undefined>) {
  const keys = ["url", "permalink", "html_url", "web_url", "link", "source_url"];
  for (const bag of bags) {
    if (!bag) continue;
    for (const key of keys) {
      const value = bag[key];
      if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
    }
  }
  return undefined;
}

function pickProvider(
  additional: Record<string, unknown> | undefined,
  metadata: Record<string, unknown> | undefined,
  sourceType?: unknown
): string | undefined {
  for (const bag of [additional, metadata]) {
    const value = bag?.["provider"] ?? bag?.["app_provider"];
    if (typeof value === "string" && value) return value;
  }
  return typeof sourceType === "string" && sourceType !== "file"
    ? sourceType
    : undefined;
}

/**
 * Graph paths come back as scored relation paths whose exact node shape is not
 * pinned by the SDK types, so render defensively rather than assuming a schema.
 */
function normaliseGraphPaths(graphContext: any): GraphPath[] {
  const paths = [
    ...(graphContext?.queryPaths ?? []),
    ...(graphContext?.chunkRelations ?? []),
  ];
  const out: GraphPath[] = [];
  for (const path of paths) {
    const description = renderPath(path);
    if (description) out.push({ description, score: path?.score });
  }
  return out.slice(0, 12);
}

function renderPath(path: any): string | null {
  if (!path) return null;
  if (typeof path === "string") return path;
  const nodes = path.path ?? path.nodes ?? path.relations;
  if (Array.isArray(nodes) && nodes.length) {
    const parts = nodes
      .map((n: any) =>
        typeof n === "string"
          ? n
          : [n?.source ?? n?.from ?? n?.subject, n?.relation ?? n?.predicate, n?.target ?? n?.to ?? n?.object]
              .filter(Boolean)
              .join(" —[")
      )
      .filter(Boolean);
    if (parts.length) return parts.join(" → ").replace(/—\[/g, "—[").slice(0, 400);
  }
  if (path.description) return String(path.description);
  return null;
}

// --- Collection resolution --------------------------------------------------

/**
 * Collections must be named explicitly on every query.
 *
 * Two API behaviours force this. Omitting `collections` does not search
 * everything — it searches nothing and returns zero chunks, silently, which
 * looks exactly like an empty workspace. And naming a collection that does not
 * exist yet is a hard 400 (`sub_tenant_ids do not exist`), so we cannot simply
 * pass the full static list either: a collection only comes into being once
 * something has been ingested into it.
 *
 * So every query resolves its scope against the collections that actually
 * exist right now.
 */
const COLLECTION_CACHE_MS = 30_000;
let collectionCache: { at: number; value: string[] } | null = null;

async function existingCollections(): Promise<string[]> {
  if (collectionCache && Date.now() - collectionCache.at < COLLECTION_CACHE_MS) {
    return collectionCache.value;
  }
  const value = await listCollections();
  collectionCache = { at: Date.now(), value };
  return value;
}

/** Called after ingestion, which may have brought a new collection into being. */
export function invalidateCollectionCache(): void {
  collectionCache = null;
}

const EMPTY_RESULT = (mode: RecallMode, latencyMs: number): HydraQueryResult => ({
  chunks: [],
  sources: [],
  graphPaths: [],
  latencyMs,
  mode,
  apiCalls: 0,
});

// --- Core query -------------------------------------------------------------

/**
 * Single entry point for retrieval. Latency and call count are measured here so
 * the metrics dashboard reports what actually happened rather than an estimate.
 */
export async function queryHydra(
  options: QueryOptions
): Promise<HydraQueryResult> {
  const {
    question,
    mode,
    maxResults = mode === "thinking" ? 24 : 10,
    collections,
    metadataFilters,
    graphContext = mode === "thinking",
    additionalContext,
  } = options;

  const started = Date.now();

  // Resolve scope against reality: unscoped means "every collection that
  // exists", and a requested collection that has never been ingested into is
  // dropped rather than 400-ing the whole query.
  const available = await existingCollections();
  const scope = collections?.length
    ? collections.filter((name) => available.includes(name))
    : available;

  // Nothing to search — a workspace with no ingested data, or a question
  // scoped to a source that has not synced yet. Both are empty results, not
  // errors, and neither is worth a round-trip.
  if (!scope.length) return EMPTY_RESULT(mode, Date.now() - started);

  const response = await hydra().query({
    query: question,
    database: HYDRA_DATABASE(),
    mode,
    maxResults,
    // Activates thread/parent/ID/actor-aware retrieval. Essential for
    // "who filed BUG-123" style questions over connector-synced data.
    queryApps: true,
    graphContext,
    type: "all",
    queryBy: "hybrid",
    collections: scope,
    ...(metadataFilters ? { metadataFilters } : {}),
    ...(additionalContext ? { additionalContext } : {}),
  });

  const latencyMs = Date.now() - started;
  const data = (response as any)?.data ?? {};

  return {
    chunks: (data.chunks ?? []).map(normaliseChunk),
    sources: (data.sources ?? []).map(normaliseSource),
    graphPaths: normaliseGraphPaths(data.graphContext),
    latencyMs,
    mode,
    apiCalls: 1,
  };
}

// --- Database lifecycle -----------------------------------------------------

export interface DatabaseStatus {
  exists: boolean;
  readyForIngestion: boolean;
  graphStatus?: boolean;
  schedulerStatus?: boolean;
  message?: string;
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  try {
    const response = await hydra().databases.status({
      database: HYDRA_DATABASE(),
    });
    const infra = (response as any)?.data?.infra ?? {};
    return {
      exists: true,
      readyForIngestion: infra.readyForIngestion === true,
      graphStatus: infra.graphStatus,
      schedulerStatus: infra.schedulerStatus,
      message: (response as any)?.data?.message,
    };
  } catch (error: any) {
    // A 404 means "not created yet", which is a normal pre-setup state rather
    // than a failure — the setup wizard renders it as an actionable step.
    if (error?.statusCode === 404 || error?.status === 404) {
      return { exists: false, readyForIngestion: false };
    }
    throw error;
  }
}

export async function createDatabase(): Promise<void> {
  await hydra().databases.create({ database: HYDRA_DATABASE() });
}

/**
 * Database creation is asynchronous. Callers must not ingest or query until
 * `infra.readyForIngestion` flips true.
 */
export async function waitForDatabaseReady(
  { timeoutMs = 300_000, intervalMs = 5_000, onTick }: {
    timeoutMs?: number;
    intervalMs?: number;
    onTick?: (status: DatabaseStatus, elapsedMs: number) => void;
  } = {}
): Promise<DatabaseStatus> {
  const started = Date.now();
  for (;;) {
    const status = await getDatabaseStatus();
    onTick?.(status, Date.now() - started);
    if (status.readyForIngestion) return status;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Database "${HYDRA_DATABASE()}" was not ready within ${Math.round(
          timeoutMs / 1000
        )}s. Check provisioning at https://app.hydradb.com`
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function listCollections(): Promise<string[]> {
  const response = await hydra().databases.collections({
    database: HYDRA_DATABASE(),
  });
  const data = (response as any)?.data ?? {};
  // `collections` is canonical in v2; `subTenantIds` is its deprecated alias.
  const ids = data.collections ?? data.subTenantIds ?? [];
  return Array.isArray(ids) ? ids.map(String) : [];
}
