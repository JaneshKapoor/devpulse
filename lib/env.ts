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

/** Throws a typed, actionable error when a required variable is absent. */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") throw new MissingEnvError(key);
  return value.trim();
}

export function optionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * True when a variable is set to something other than the placeholder shipped
 * in .env.example. Used by the setup UI to show which connectors are ready
 * without ever sending the value itself to the browser.
 */
export function isConfigured(key: string): boolean {
  const value = optionalEnv(key);
  if (!value) return false;
  return !/^(your_|xoxp-your|REPLACE_WITH)/i.test(value);
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
