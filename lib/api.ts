/**
 * Shared API-route plumbing: one success shape, one error shape, one place
 * that decides how an exception becomes an HTTP response.
 *
 * Every route returns either
 *   { success: true,  data: T }
 * or
 *   { success: false, error: string, code?: string }
 */

import { NextResponse } from "next/server";
import type { z } from "zod";

import { MissingEnvError } from "./env";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string; code?: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, init);
}

export function fail(error: string, code?: string, status = 500) {
  return NextResponse.json<ApiFailure>(
    { success: false, error, ...(code ? { code } : {}) },
    { status }
  );
}

/** The subset of HydraDBError / fetch-error fields this module reads. */
interface UpstreamError {
  statusCode?: number;
  status?: number;
  body?: unknown;
  message?: string;
}

/**
 * Translates a thrown value into a response. Missing credentials are by far the
 * most common failure when running this for the first time, so they get a
 * dedicated code and a 400 rather than being reported as a server fault.
 */
export function toErrorResponse(error: unknown) {
  if (error instanceof MissingEnvError) {
    return fail(error.message, error.code, 400);
  }

  const upstream: UpstreamError =
    error && typeof error === "object" ? (error as UpstreamError) : {};
  const status = upstream.statusCode ?? upstream.status;

  if (typeof status === "number" && status >= 400 && status < 500) {
    const detail =
      extractMessage(upstream.body) ??
      upstream.message ??
      "Upstream request was rejected.";
    return fail(detail, "UPSTREAM_CLIENT_ERROR", status);
  }

  const message =
    extractMessage(upstream.body) ??
    (error instanceof Error ? error.message : String(error));

  // Logged server-side so the full cause is recoverable from the terminal
  // without leaking internals into the HTTP response.
  console.error("[devpulse] request failed:", error);

  return fail(message || "Unexpected server error.", "INTERNAL_ERROR", 500);
}

function extractMessage(body: unknown): string | undefined {
  if (!body) return undefined;
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return undefined;

  const bag = body as Record<string, unknown>;
  const nested = bag.error;
  const candidate =
    (typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>).message
      : undefined) ??
    bag.message ??
    nested ??
    bag.detail;

  if (typeof candidate === "string") return candidate.slice(0, 500);
  return JSON.stringify(body).slice(0, 500);
}

/**
 * Wraps a handler so no route can throw an unshaped error.
 *
 * The return type stays loose because handlers legitimately return a union of
 * `ok()` and `fail()` responses, which TypeScript will not unify into a single
 * `NextResponse<ApiResponse<T>>`. The response shape is guaranteed by `ok` and
 * `fail` themselves rather than by this signature.
 */
export function handler(
  fn: () => Promise<NextResponse<unknown>>
): Promise<NextResponse<unknown>> {
  return fn().catch(toErrorResponse);
}

/**
 * Parses and validates a JSON body, returning a typed result rather than
 * throwing, so routes can return a 400 with the specific field problems.
 */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S
): Promise<
  { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: fail("Request body must be valid JSON.", "INVALID_JSON", 400),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return {
      ok: false,
      response: fail(`Invalid request — ${detail}`, "VALIDATION_ERROR", 400),
    };
  }

  return { ok: true, data: parsed.data };
}

/** Same validation contract for query-string params. */
export function parseQuery<S extends z.ZodTypeAny>(
  request: Request,
  schema: S
): { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse } {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
      .join("; ");
    return {
      ok: false,
      response: fail(`Invalid query — ${detail}`, "VALIDATION_ERROR", 400),
    };
  }
  return { ok: true, data: parsed.data };
}
