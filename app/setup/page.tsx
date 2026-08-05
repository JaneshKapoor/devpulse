"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Database, Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  ConnectorCard,
  type ConnectorState,
} from "@/components/ConnectorCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProviderReadiness {
  provider: string;
  label: string;
  description: string;
  resourceNoun: string;
  credentialHelp: string;
  hasToken: boolean;
  hasScope: boolean;
  tokenEnvVar: string;
  scopeEnvVar?: string;
}

interface BootstrapPayload {
  providers: ProviderReadiness[];
  connectors: Array<{ id: string; provider: string; status?: string }>;
  database: { exists: boolean; readyForIngestion: boolean };
}

/** Unwraps the shared { success, data | error } envelope. */
async function callApi<T>(
  input: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      return {
        ok: false,
        error: payload?.error ?? `Request failed (${response.status})`,
      };
    }
    return { ok: true, data: payload.data as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export default function SetupPage() {
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [database, setDatabase] = useState<BootstrapPayload["database"] | null>(
    null
  );
  const [connectors, setConnectors] = useState<ConnectorState[]>([]);

  const update = useCallback(
    (provider: string, patch: Partial<ConnectorState>) => {
      setConnectors((prev) =>
        prev.map((c) => (c.provider === provider ? { ...c, ...patch } : c))
      );
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await callApi<BootstrapPayload>("/api/connectors");
      if (cancelled) return;

      if (!result.ok) {
        setBootError(result.error);
        setLoading(false);
        return;
      }

      const existing = new Map(
        result.data.connectors.map((c) => [c.provider, c])
      );

      setDatabase(result.data.database);
      setConnectors(
        result.data.providers.map((p) => {
          const match = existing.get(p.provider);
          const ready = p.hasToken && p.hasScope;
          return {
            ...p,
            connectorId: match?.id,
            stage: match
              ? "synced"
              : ready
                ? "not_connected"
                : "missing_credentials",
            resources: [],
            selected: [],
          } satisfies ConnectorState;
        })
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** create -> discover, surfaced as two visible stages. */
  const handleConnect = useCallback(
    async (provider: string) => {
      update(provider, { stage: "creating", error: undefined });

      const created = await callApi<{ connector: { id: string } }>(
        "/api/connectors",
        { method: "POST", body: JSON.stringify({ provider }) }
      );
      if (!created.ok) {
        update(provider, { stage: "error", error: created.error });
        return;
      }

      const connectorId = created.data.connector.id;
      update(provider, { stage: "discovering", connectorId });

      const discovered = await callApi<{
        resources: ConnectorState["resources"];
      }>(`/api/connectors/${connectorId}/discover`);
      if (!discovered.ok) {
        update(provider, { stage: "error", error: discovered.error, connectorId });
        return;
      }

      const resources = discovered.data.resources ?? [];
      update(provider, {
        stage: "discovered",
        resources,
        // Pre-select everything: the common case is "sync it all", and
        // deselecting a few is faster than picking from scratch.
        selected: resources.map((r) => r.resourceId),
      });
    },
    [update]
  );

  /** configure -> sync, chained because the hourly scheduler is too slow to demo. */
  const handleConfigure = useCallback(
    async (provider: string) => {
      const state = connectors.find((c) => c.provider === provider);
      if (!state?.connectorId) return;

      update(provider, { stage: "configuring", error: undefined });

      const chosen = state.resources.filter((r) =>
        state.selected.includes(r.resourceId)
      );

      const configured = await callApi(
        `/api/connectors/${state.connectorId}/configure`,
        {
          method: "POST",
          body: JSON.stringify({
            provider,
            resources: chosen,
            lookbackDays: 30,
          }),
        }
      );
      if (!configured.ok) {
        update(provider, { stage: "error", error: configured.error });
        return;
      }

      update(provider, { stage: "syncing" });

      const synced = await callApi(
        `/api/connectors/${state.connectorId}/sync`,
        { method: "POST" }
      );
      if (!synced.ok) {
        update(provider, { stage: "error", error: synced.error });
        return;
      }

      update(provider, {
        stage: "synced",
        syncedAt: new Date().toLocaleTimeString(),
      });
    },
    [connectors, update]
  );

  const handleSync = useCallback(
    async (provider: string) => {
      const state = connectors.find((c) => c.provider === provider);
      if (!state?.connectorId) return;

      update(provider, { stage: "syncing", error: undefined });
      const result = await callApi(
        `/api/connectors/${state.connectorId}/sync`,
        { method: "POST" }
      );
      update(provider, {
        stage: result.ok ? "synced" : "error",
        error: result.ok ? undefined : result.error,
        syncedAt: result.ok ? new Date().toLocaleTimeString() : state.syncedAt,
      });
    },
    [connectors, update]
  );

  const syncedCount = connectors.filter((c) => c.stage === "synced").length;

  return (
    <AppShell active="setup">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Connect your sources
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each connector syncs into its own collection inside one HydraDB
              database, so DevPulse can query them together or in isolation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={syncedCount >= 3 ? "success" : "default"}>
              {syncedCount} of 5 connected
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/upload">Upload documents</Link>
            </Button>
            <Button asChild size="sm" disabled={syncedCount === 0}>
              <Link href="/dashboard">
                Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        <DatabaseBanner database={database} loading={loading} />

        {bootError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Could not load connector state</AlertTitle>
            <AlertDescription className="break-anywhere">
              {bootError}
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {connectors.map((state) => (
              <ConnectorCard
                key={state.provider}
                state={state}
                onConnect={() => handleConnect(state.provider)}
                onConfigure={() => handleConfigure(state.provider)}
                onSync={() => handleSync(state.provider)}
                onToggleResource={(resourceId) =>
                  update(state.provider, {
                    selected: state.selected.includes(resourceId)
                      ? state.selected.filter((id) => id !== resourceId)
                      : [...state.selected, resourceId],
                  })
                }
                onSelectAll={() =>
                  update(state.provider, {
                    selected:
                      state.selected.length === state.resources.length
                        ? []
                        : state.resources.map((r) => r.resourceId),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function DatabaseBanner({
  database,
  loading,
}: {
  database: BootstrapPayload["database"] | null;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-16" />;
  if (!database) return null;

  if (database.exists && database.readyForIngestion) {
    return (
      <Card className="border-emerald-500/25 bg-emerald-500/5">
        <CardContent className="flex items-center gap-3 p-4 text-sm">
          <Database className="h-4 w-4 text-emerald-400" />
          <span className="text-emerald-200">
            HydraDB database is provisioned and ready for ingestion.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Alert variant="warning">
      {database.exists ? <Loader2 className="animate-spin" /> : <AlertCircle />}
      <AlertTitle>
        {database.exists
          ? "Database is still provisioning"
          : "HydraDB database not created yet"}
      </AlertTitle>
      <AlertDescription>
        Run{" "}
        <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
          npm run setup:hydradb
        </code>{" "}
        and wait for it to report ready. Connectors can be created before then,
        but queries will return nothing until ingestion is enabled.
      </AlertDescription>
    </Alert>
  );
}
