import { z } from "zod";

import { fail, handler, ok, parseQuery } from "@/lib/api";
import {
  getDocumentStatus,
  ingestDocument,
  validateUpload,
} from "@/lib/documents";

export const dynamic = "force-dynamic";

const statusSchema = z.object({
  ids: z.string().min(1, "at least one source id is required"),
});

/** Polled by the upload UI until indexing reaches a terminal state. */
export async function GET(request: Request) {
  return handler(async () => {
    const parsed = parseQuery(request, statusSchema);
    if (!parsed.ok) return parsed.response;

    const ids = parsed.data.ids.split(",").map((s) => s.trim()).filter(Boolean);
    const statuses = await getDocumentStatus(ids);

    return ok({
      statuses,
      allComplete:
        statuses.length > 0 && statuses.every((s) => s.completed || s.failed),
    });
  });
}

/**
 * Multipart upload → HydraDB knowledge ingestion.
 *
 * Files are validated and ingested one at a time so a single bad file reports
 * its own reason instead of failing the whole batch opaquely.
 */
export async function POST(request: Request) {
  return handler(async () => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(
        "Expected a multipart/form-data upload.",
        "INVALID_FORM",
        400
      );
    }

    const files = form
      .getAll("documents")
      .filter((entry): entry is File => entry instanceof File);

    if (!files.length) {
      return fail(
        "No files received. Attach at least one document.",
        "NO_FILES",
        400
      );
    }

    const rejected = files
      .map((file) => validateUpload(file))
      .filter((reason): reason is string => reason !== null);

    if (rejected.length) {
      return fail(rejected.join(" "), "UNSUPPORTED_FILE", 400);
    }

    const uploaded = [];
    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const outcome = await ingestDocument(file);
      uploaded.push(...outcome.documents);
      successCount += outcome.successCount;
      failedCount += outcome.failedCount;
    }

    return ok(
      {
        documents: uploaded,
        successCount,
        failedCount,
        // Indexing continues after this returns; the client polls GET.
        sourceIds: uploaded.map((d) => d.sourceId).filter(Boolean),
      },
      { status: 202 }
    );
  });
}
