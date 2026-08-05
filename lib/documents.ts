/**
 * Document ingestion — the second, distinct path into HydraDB.
 *
 * Connectors sync continuously from a provider; this uploads a one-off file
 * (architecture doc, RFC, onboarding wiki) into the `docs` collection. Both
 * paths land in the same database, so a single query can reason across a
 * written spec and live Slack/GitHub activity together.
 *
 * Server-only.
 */

import "server-only";

import { hydra } from "./hydradb";
import { COLLECTIONS, HYDRA_DATABASE } from "./env";

export interface IngestedDocument {
  sourceId: string;
  filename: string;
  status: string;
}

export interface IngestOutcome {
  documents: IngestedDocument[];
  successCount: number;
  failedCount: number;
  message?: string;
}

/** Rejected before upload so the user gets a clear reason, not a 500. */
export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".md",
  ".markdown",
  ".txt",
  ".docx",
] as const;

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function validateUpload(file: File): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${
      MAX_FILE_BYTES / 1024 / 1024
    }MB.`;
  }
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `"${file.name}" is not a supported type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.`;
  }
  return null;
}

/**
 * Uploads one file as `knowledge` into the docs collection.
 *
 * The SDK's `documents` field takes a single Uploadable, so multi-file uploads
 * are sequential calls rather than one batched request.
 */
export async function ingestDocument(
  file: File,
  extraMetadata?: Record<string, unknown>
): Promise<IngestOutcome> {
  const response = await hydra().context.ingest({
    database: HYDRA_DATABASE(),
    collection: COLLECTIONS.docs,
    type: "knowledge",
    documents: file,
    // documentMetadata is a JSON-encoded string on the wire, not an object.
    documentMetadata: JSON.stringify({
      source: "manual_upload",
      filename: file.name,
      uploaded_at: new Date().toISOString(),
      ...extraMetadata,
    }),
  });

  const data = (response as { data?: Record<string, unknown> })?.data ?? {};
  const results = Array.isArray(data.results) ? data.results : [];

  return {
    documents: results.map((item: Record<string, unknown>) => ({
      sourceId: String(item.source_id ?? item.sourceId ?? item.id ?? ""),
      filename: String(item.filename ?? item.name ?? file.name),
      status: String(item.status ?? "queued"),
    })),
    successCount: Number(data.successCount ?? data.success_count ?? 0),
    failedCount: Number(data.failedCount ?? data.failed_count ?? 0),
    message: data.message ? String(data.message) : undefined,
  };
}

export interface DocumentStatus {
  sourceId: string;
  indexingStatus: string;
  /** True once the document is queryable. */
  completed: boolean;
  failed: boolean;
}

/**
 * Indexing is asynchronous — a document is not queryable the moment upload
 * returns. The upload UI polls this until every source reaches a terminal state.
 */
export async function getDocumentStatus(
  sourceIds: string[]
): Promise<DocumentStatus[]> {
  if (!sourceIds.length) return [];

  const response = await hydra().context.status({
    ids: sourceIds,
    database: HYDRA_DATABASE(),
    collection: COLLECTIONS.docs,
  });

  const data = (response as { data?: Record<string, unknown> })?.data ?? {};
  const statuses = Array.isArray(data.statuses) ? data.statuses : [];

  return statuses.map((item: Record<string, unknown>) => {
    const raw = String(
      item.indexing_status ?? item.indexingStatus ?? item.status ?? "unknown"
    ).toLowerCase();
    return {
      sourceId: String(item.source_id ?? item.sourceId ?? item.id ?? ""),
      indexingStatus: raw,
      completed: raw === "completed" || raw === "complete" || raw === "indexed",
      failed: raw === "failed" || raw === "error",
    };
  });
}
