"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";

export type ConnectorStage =
  | "not_connected"
  | "missing_credentials"
  | "creating"
  | "discovering"
  | "discovered"
  | "configuring"
  | "syncing"
  | "synced"
  | "error";

export interface DiscoveredResource {
  resourceId: string;
  name: string;
  resourceType?: string;
  detail?: string;
}

export interface ConnectorState {
  provider: string;
  label: string;
  description: string;
  resourceNoun: string;
  credentialHelp: string;
  tokenEnvVar: string;
  scopeEnvVar?: string;
  hasToken: boolean;
  hasScope: boolean;
  stage: ConnectorStage;
  connectorId?: string;
  resources: DiscoveredResource[];
  selected: string[];
  error?: string;
  syncedAt?: string;
}

const STAGE_META: Record<
  ConnectorStage,
  { label: string; variant: "default" | "pulse" | "success" | "warning" | "destructive" }
> = {
  not_connected: { label: "Not connected", variant: "default" },
  missing_credentials: { label: "Credentials needed", variant: "warning" },
  creating: { label: "Creating…", variant: "pulse" },
  discovering: { label: "Discovering…", variant: "pulse" },
  discovered: { label: "Select resources", variant: "pulse" },
  configuring: { label: "Configuring…", variant: "pulse" },
  syncing: { label: "Syncing…", variant: "pulse" },
  synced: { label: "Synced", variant: "success" },
  error: { label: "Error", variant: "destructive" },
};

const BUSY: ConnectorStage[] = [
  "creating",
  "discovering",
  "configuring",
  "syncing",
];

export function ConnectorCard({
  state,
  onConnect,
  onToggleResource,
  onSelectAll,
  onConfigure,
  onSync,
}: {
  state: ConnectorState;
  onConnect: () => void;
  onToggleResource: (resourceId: string) => void;
  onSelectAll: () => void;
  onConfigure: () => void;
  onSync: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = STAGE_META[state.stage];
  const busy = BUSY.includes(state.stage);
  const blocked = !state.hasToken || !state.hasScope;

  return (
    <Card className={cn(state.stage === "error" && "border-red-500/40")}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-secondary p-2">
              <ProviderIcon provider={state.provider} />
            </div>
            <div>
              <CardTitle className="text-base">{state.label}</CardTitle>
              <CardDescription className="mt-1">
                {state.description}
              </CardDescription>
            </div>
          </div>
          <Badge variant={meta.variant} className="shrink-0">
            {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {state.stage === "synced" && <Check className="mr-1 h-3 w-3" />}
            {meta.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {blocked && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  Add {!state.hasToken ? state.tokenEnvVar : state.scopeEnvVar}{" "}
                  to .env.local
                </p>
                <p className="text-amber-200/70">{state.credentialHelp}</p>
              </div>
            </div>
          </div>
        )}

        {state.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="break-anywhere">{state.error}</p>
            </div>
          </div>
        )}

        {state.resources.length > 0 && (
          <div className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <span>
                {state.selected.length} of {state.resources.length}{" "}
                {state.resourceNoun}
                {state.resources.length === 1 ? "" : "s"} selected
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  expanded && "rotate-180"
                )}
              />
            </button>

            {expanded && (
              <div className="max-h-52 overflow-y-auto border-t border-border scrollbar-thin">
                {state.resources.map((resource) => {
                  const checked = state.selected.includes(resource.resourceId);
                  return (
                    <label
                      key={resource.resourceId}
                      className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm hover:bg-secondary/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleResource(resource.resourceId)}
                        className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{resource.name}</span>
                        {resource.detail && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {resource.detail}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {state.stage === "not_connected" ||
          state.stage === "missing_credentials" ||
          state.stage === "error" ? (
            <Button size="sm" onClick={onConnect} disabled={blocked || busy}>
              Connect &amp; discover
            </Button>
          ) : null}

          {state.resources.length > 0 && state.stage !== "synced" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onSelectAll}
                disabled={busy}
              >
                {state.selected.length === state.resources.length
                  ? "Clear all"
                  : "Select all"}
              </Button>
              <Button
                size="sm"
                onClick={onConfigure}
                disabled={busy || state.selected.length === 0}
              >
                Configure &amp; sync ({state.selected.length})
              </Button>
            </>
          )}

          {state.connectorId && state.stage === "synced" && (
            <Button size="sm" variant="outline" onClick={onSync} disabled={busy}>
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
              Sync now
            </Button>
          )}
        </div>

        {state.syncedAt && (
          <p className="text-xs text-muted-foreground">
            Last sync triggered {state.syncedAt}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
