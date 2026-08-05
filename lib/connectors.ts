/**
 * Per-provider connector helpers.
 *
 * HydraDB's connector lifecycle is four distinct steps, and skipping any of
 * them leaves a connector that looks configured but never syncs:
 *
 *   create    → register the provider + credentials + account scope
 *   discover  → list the resources that account can see (channels, repos, …)
 *   configure → activate the chosen resources with a lookback window
 *   sync      → trigger an immediate backfill
 *
 * The default scheduler runs hourly, which is useless during a demo, so the UI
 * always triggers `sync` explicitly after `configure`.
 *
 * Server-only.
 */

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Adapter boundary. The SDK types connector list/get/discover responses as
 * `Record<string, unknown>`, and each provider names its discover fields
 * differently, so the shaping helpers probe untyped payloads on purpose. The
 * exported surface is fully typed.
 */

import "server-only";

import { hydra } from "./hydradb";
import { COLLECTIONS, HYDRA_DATABASE, isConfigured, optionalEnv, requireEnv } from "./env";

export type ProviderId = "github" | "slack" | "linear" | "notion" | "gmail";

export const PROVIDER_IDS: ProviderId[] = [
  "github",
  "slack",
  "linear",
  "notion",
  "gmail",
];

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  /** Collection this provider's data lands in. */
  collection: string;
  tokenEnvVar: string;
  scopeEnvVar?: string;
  /** What a discovered resource represents, for UI copy. */
  resourceNoun: string;
  description: string;
  credentialHelp: string;
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  github: {
    id: "github",
    label: "GitHub",
    collection: COLLECTIONS.github,
    tokenEnvVar: "GITHUB_CONNECTOR_TOKEN",
    scopeEnvVar: "GITHUB_ORG_OR_USER",
    resourceNoun: "repository",
    description: "Pull requests, issues, commits and reviews.",
    credentialHelp:
      "Personal access token with repo and read:org scope — github.com/settings/tokens",
  },
  slack: {
    id: "slack",
    label: "Slack",
    collection: COLLECTIONS.slack,
    tokenEnvVar: "SLACK_CONNECTOR_TOKEN",
    scopeEnvVar: "SLACK_WORKSPACE_ID",
    resourceNoun: "channel",
    description: "Channel messages and threaded discussion.",
    credentialHelp:
      "User or bot token with channels:history, channels:read, users:read — api.slack.com/apps",
  },
  linear: {
    id: "linear",
    label: "Linear",
    collection: COLLECTIONS.linear,
    tokenEnvVar: "LINEAR_CONNECTOR_TOKEN",
    scopeEnvVar: "LINEAR_WORKSPACE_NAME",
    resourceNoun: "team",
    description: "Issues, status changes, cycles and comments.",
    credentialHelp: "Personal API key from Linear → Settings → API",
  },
  notion: {
    id: "notion",
    label: "Notion",
    collection: COLLECTIONS.notion,
    tokenEnvVar: "NOTION_CONNECTOR_TOKEN",
    scopeEnvVar: "NOTION_WORKSPACE_NAME",
    resourceNoun: "database or page",
    description: "Specs, RFCs and team wiki pages.",
    credentialHelp:
      "Internal integration token from notion.so/my-integrations — remember to share pages with it",
  },
  gmail: {
    id: "gmail",
    label: "Gmail",
    collection: COLLECTIONS.gmail,
    tokenEnvVar: "GMAIL_CONNECTOR_TOKEN",
    // Gmail has no workspace-level scope; the account email travels in
    // additional_metadata instead. See providerAccountScope() below.
    scopeEnvVar: undefined,
    resourceNoun: "label",
    description: "Threads with reviewers, managers and external partners.",
    credentialHelp: "OAuth access token with the gmail.readonly scope",
  },
};

/**
 * `provider_account_scope` is what stops two connectors for the same provider
 * from colliding. Gmail is the exception: it has no workspace-level identifier,
 * so its account email is carried in additional_metadata instead.
 */
function providerAccountScope(provider: ProviderId): string | undefined {
  const definition = PROVIDERS[provider];
  if (!definition.scopeEnvVar) return undefined;
  return optionalEnv(definition.scopeEnvVar);
}

/**
 * Every provider here authenticates with a bearer-style token, which HydraDB
 * expects under `api_token`. Kept as a function so provider-specific shapes
 * (OAuth pairs, refresh tokens) can diverge without touching call sites.
 */
function credentialsFor(provider: ProviderId): Record<string, unknown> {
  const token = requireEnv(PROVIDERS[provider].tokenEnvVar);
  switch (provider) {
    case "gmail":
      // Gmail is OAuth-based, so the token is an access token rather than a
      // long-lived API key.
      return { access_token: token };
    default:
      return { api_token: token };
  }
}

function authTypeFor(provider: ProviderId): string {
  return provider === "gmail" ? "oauth" : "api_token";
}

/** Extra metadata merged onto every object synced from this provider. */
function connectorMetadata(provider: ProviderId): Record<string, unknown> {
  const base: Record<string, unknown> = { provider, app: "devpulse" };
  if (provider === "gmail") {
    const email = optionalEnv("GMAIL_ACCOUNT_EMAIL");
    if (email) base.account_email = email;
  }
  return base;
}

export interface DiscoveredResource {
  resourceId: string;
  name: string;
  resourceType?: string;
  /** Free-form extras the provider returned, shown as secondary UI text. */
  detail?: string;
}

export interface ConnectorRecord {
  id: string;
  provider: ProviderId;
  name?: string;
  status?: string;
  lastSyncedAt?: string;
  resourceCount?: number;
}

// --- Credential readiness ---------------------------------------------------

export interface ProviderReadiness {
  provider: ProviderId;
  label: string;
  description: string;
  resourceNoun: string;
  credentialHelp: string;
  /** True when a real (non-placeholder) token is present in the environment. */
  hasToken: boolean;
  hasScope: boolean;
  scopeEnvVar?: string;
  tokenEnvVar: string;
}

/**
 * Reports which providers are configured without ever exposing a credential
 * value — the setup UI needs to know "is this ready", not what the token is.
 */
export function readiness(): ProviderReadiness[] {
  return PROVIDER_IDS.map((provider) => {
    const definition = PROVIDERS[provider];
    return {
      provider,
      label: definition.label,
      description: definition.description,
      resourceNoun: definition.resourceNoun,
      credentialHelp: definition.credentialHelp,
      hasToken: isConfigured(definition.tokenEnvVar),
      hasScope: definition.scopeEnvVar
        ? isConfigured(definition.scopeEnvVar)
        : true,
      scopeEnvVar: definition.scopeEnvVar,
      tokenEnvVar: definition.tokenEnvVar,
    };
  });
}

// --- Lifecycle --------------------------------------------------------------

export async function createConnector(
  provider: ProviderId
): Promise<ConnectorRecord> {
  const definition = PROVIDERS[provider];
  const scope = providerAccountScope(provider);

  const response = await hydra().connectors.create({
    provider,
    name: `DevPulse ${definition.label}`,
    database: HYDRA_DATABASE(),
    collection: definition.collection,
    credentials: credentialsFor(provider),
    authType: authTypeFor(provider),
    ...(scope ? { providerAccountScope: scope } : {}),
  });

  return toConnectorRecord(response, provider);
}

/**
 * Lists resources for an existing connector. Pages through the cursor so a
 * workspace with more than 100 channels is fully represented.
 */
export async function discoverResources(
  connectorId: string
): Promise<DiscoveredResource[]> {
  const collected: DiscoveredResource[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const response: any = await hydra().connectors.discover({
      id: connectorId,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    const payload = response?.data ?? response ?? {};
    const items = payload.resources ?? payload.data ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const resource = toDiscoveredResource(item);
      if (resource) collected.push(resource);
    }
    cursor = payload.next_cursor ?? payload.nextCursor;
    if (!cursor) break;
  }

  return collected;
}

/**
 * Discovers resources before a connector exists, using raw credentials. Lets
 * the setup wizard show what would be synced without creating anything first.
 */
export async function previewResources(
  provider: ProviderId
): Promise<DiscoveredResource[]> {
  const response: any = await hydra().connectors.discoverPreview({
    provider,
    credentials: credentialsFor(provider),
    authType: authTypeFor(provider),
    limit: 100,
  });
  const payload = response?.data ?? response ?? {};
  const items = payload.resources ?? payload.data ?? [];
  return (Array.isArray(items) ? items : [])
    .map(toDiscoveredResource)
    .filter((r): r is DiscoveredResource => r !== null);
}

export async function configureConnector(
  connectorId: string,
  provider: ProviderId,
  resources: DiscoveredResource[],
  lookbackDays = 30
): Promise<void> {
  const definition = PROVIDERS[provider];
  const extraMetadata = connectorMetadata(provider);

  await hydra().connectors.configure({
    id: connectorId,
    lookbackDays,
    resources: resources.map((resource) => ({
      resourceId: resource.resourceId,
      name: resource.name,
      ...(resource.resourceType ? { resourceType: resource.resourceType } : {}),
      database: HYDRA_DATABASE(),
      collection: definition.collection,
      // Merged onto every synced object, so queries can filter by provider
      // and Gmail items carry the account they came from.
      additionalMetadata: extraMetadata,
    })),
  });
}

export async function syncConnector(connectorId: string): Promise<void> {
  await hydra().connectors.sync({ id: connectorId });
}

export async function listConnectors(): Promise<ConnectorRecord[]> {
  const response: any = await hydra().connectors.list({
    database: HYDRA_DATABASE(),
  } as any);
  const payload = response?.data ?? response ?? {};
  const items = payload.connectors ?? payload.data ?? [];
  return (Array.isArray(items) ? items : [])
    .map((item: any) => toConnectorRecord(item, item?.provider))
    .filter((c: ConnectorRecord) => Boolean(c.id));
}

export async function getConnector(
  connectorId: string
): Promise<ConnectorRecord> {
  const response: any = await hydra().connectors.get({ id: connectorId });
  return toConnectorRecord(response, response?.data?.provider ?? response?.provider);
}

export async function deleteConnector(connectorId: string): Promise<void> {
  await hydra().connectors.delete({ id: connectorId });
}

// --- Response shaping -------------------------------------------------------

function toConnectorRecord(response: any, provider: any): ConnectorRecord {
  const payload = response?.data ?? response ?? {};
  return {
    id: String(payload.id ?? payload.connector_id ?? payload.connectorId ?? ""),
    provider: (payload.provider ?? provider) as ProviderId,
    name: payload.name,
    status: payload.status ?? payload.state,
    lastSyncedAt:
      payload.last_synced_at ?? payload.lastSyncedAt ?? payload.last_sync,
    resourceCount:
      payload.resource_count ??
      payload.resourceCount ??
      (Array.isArray(payload.resources) ? payload.resources.length : undefined),
  };
}

/**
 * Discover responses are typed as `Record<string, unknown>` by the SDK and the
 * key names differ per provider, so probe the plausible spellings rather than
 * assuming one schema.
 */
function toDiscoveredResource(item: any): DiscoveredResource | null {
  if (!item || typeof item !== "object") return null;
  const resourceId =
    item.resource_id ?? item.resourceId ?? item.id ?? item.key ?? item.name;
  if (!resourceId) return null;

  const name =
    item.name ??
    item.title ??
    item.display_name ??
    item.full_name ??
    String(resourceId);

  const detailParts = [
    item.description,
    item.topic,
    item.purpose,
    typeof item.is_private === "boolean"
      ? item.is_private
        ? "private"
        : "public"
      : undefined,
    typeof item.num_members === "number" ? `${item.num_members} members` : undefined,
  ].filter(Boolean);

  return {
    resourceId: String(resourceId),
    name: String(name),
    resourceType: item.resource_type ?? item.resourceType ?? item.type,
    detail: detailParts.length ? detailParts.join(" · ") : undefined,
  };
}
