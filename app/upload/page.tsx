"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
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
import { cn } from "@/lib/utils";

interface TrackedDocument {
  sourceId: string;
  filename: string;
  status: string;
}

type Phase = "idle" | "uploading" | "indexing" | "done" | "error";

const ACCEPT = ".pdf,.md,.markdown,.txt,.docx";

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<TrackedDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Indexing is asynchronous, so a document is not queryable when upload
  // returns. Poll until every source reaches a terminal state.
  useEffect(() => {
    if (phase !== "indexing") return;
    const ids = documents.map((d) => d.sourceId).filter(Boolean);
    if (!ids.length) {
      setPhase("done");
      return;
    }

    const tick = async () => {
      try {
        const response = await fetch(
          `/api/ingest?ids=${encodeURIComponent(ids.join(","))}`
        );
        const payload = await response.json();
        if (!payload?.success) return;

        const statuses: Array<{
          sourceId: string;
          indexingStatus: string;
          completed: boolean;
          failed: boolean;
        }> = payload.data.statuses ?? [];

        setDocuments((prev) =>
          prev.map((doc) => {
            const match = statuses.find((s) => s.sourceId === doc.sourceId);
            return match ? { ...doc, status: match.indexingStatus } : doc;
          })
        );

        if (payload.data.allComplete) setPhase("done");
      } catch {
        // Transient polling failures are non-fatal — the next tick retries.
      }
    };

    void tick();
    pollRef.current = setInterval(tick, 3000);

    // Stop polling after 3 minutes rather than hammering the API forever.
    const stop = setTimeout(() => setPhase("done"), 180_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(stop);
    };
  }, [phase, documents]);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const file of Array.from(incoming)) {
        if (!seen.has(`${file.name}:${file.size}`)) next.push(file);
      }
      return next;
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (!files.length) return;
    setPhase("uploading");
    setError(null);

    const form = new FormData();
    for (const file of files) form.append("documents", file);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();

      if (!payload?.success) {
        setError(payload?.error ?? `Upload failed (${response.status})`);
        setPhase("error");
        return;
      }

      setDocuments(payload.data.documents ?? []);
      setFiles([]);
      setPhase("indexing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPhase("error");
    }
  }, [files]);

  const busy = phase === "uploading" || phase === "indexing";

  return (
    <AppShell active="upload">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Upload team documents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Architecture docs, RFCs and onboarding wikis land in the{" "}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
              docs
            </code>{" "}
            collection. This is a separate ingestion path from connectors —
            one-time upload rather than continuous sync — but both land in the
            same database, so one question can span a written spec and live
            Slack or GitHub activity.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>
              PDF, Markdown, plain text or DOCX. Up to 20MB each.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
                dragging && "border-pulse bg-pulse/5",
                busy && "pointer-events-none opacity-60"
              )}
            >
              <UploadCloud className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm">
                Drop files here or{" "}
                <span className="text-pulse underline-offset-4 hover:underline">
                  browse
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{ACCEPT}</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((file) => (
                  <li
                    key={`${file.name}:${file.size}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)}KB
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setFiles((prev) => prev.filter((f) => f !== file))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription className="break-anywhere">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleUpload} disabled={!files.length || busy}>
                {phase === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {phase === "uploading"
                  ? "Uploading…"
                  : `Upload ${files.length || ""}`.trim()}
              </Button>
              {phase === "indexing" && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Indexing — documents become queryable as they complete.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Indexing status</CardTitle>
              <CardDescription>
                A document is only queryable once it reports completed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {documents.map((doc) => {
                const complete = /complete|indexed/i.test(doc.status);
                const failed = /fail|error/i.test(doc.status);
                return (
                  <div
                    key={doc.sourceId || doc.filename}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{doc.filename}</span>
                    <Badge
                      variant={
                        complete ? "success" : failed ? "destructive" : "pulse"
                      }
                    >
                      {complete && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {!complete && !failed && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {doc.status}
                    </Badge>
                  </div>
                );
              })}

              {phase === "done" && (
                <div className="pt-2">
                  <Button asChild size="sm">
                    <Link href="/dashboard">Ask DevPulse about these docs</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
