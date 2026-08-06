/**
 * Server-side environment access.
 *
 * Nothing in this module may be imported from a "use client" component — every
 * value here is a secret or server-only configuration. Reads are lazy so that a
 * missing connector credential only fails the route that actually needs it,
 * rather than crashing the whole app at import time.
 */

export class MissingEnvError extends Error {
  readonly code = "MISSING_ENV";
  constructor(public readonly key: string) {
    super(
      `Missing required environment variable ${key}. ` +
        `Copy .env.example to .env.local and fill it in.`
    );
    this.name = "MissingEnvError";
  }
}

/**
 * Matches the untouched placeholders shipped in .env.example.
 *
 * `cp .env.example .env.local` is the documented first step, so the common
 * failure is a variable that is *present but unedited*. Treating that as set
 * would forward `your_hydradb_api_key` upstream and surface a vendor error
 * ("malformed API key") instead of telling the user to fill in the file.
 */
const PLACEHOLDER = /^(your_|xoxp-your|REPLACE_WITH)/i;

/**
 * Throws a typed, actionable error when a required variable is absent — or
 * still holds its .env.example placeholder, which is absent in every way that
 * matters.
 */
export function requireEnv(key: string): string {
  const value = optionalEnv(key);
  if (!value) throw new MissingEnvError(key);
  return value;
}

/** Unset, blank and placeholder values are all reported as undefined. */
export function optionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (!value || PLACEHOLDER.test(value)) return undefined;
  return value;
}

/**
 * True when a variable holds a real value. Used by the setup UI to show which
 * connectors are ready without ever sending the value itself to the browser.
 */
export function isConfigured(key: string): boolean {
  return optionalEnv(key) !== undefined;
}

export const HYDRA_DATABASE = () =>
  optionalEnv("HYDRA_DB_DATABASE") ?? "devpulse_team";

export const HYDRA_API_VERSION = () =>
  optionalEnv("HYDRA_DB_API_VERSION") ?? "2";

/**
 * Collections partition the database by source so queries can be scoped to a
 * single provider. One per connector, plus `docs` for uploaded files.
 */
export const COLLECTIONS = {
  github: "github",
  slack: "slack",
  linear: "linear",
  notion: "notion",
  gmail: "gmail",
  docs: "docs",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const ALL_COLLECTIONS = Object.values(COLLECTIONS);
