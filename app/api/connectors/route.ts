import { z } from "zod";

import { handler, ok, parseBody } from "@/lib/api";
import {
  PROVIDER_IDS,
  type ProviderId,
  createConnector,
  listConnectors,
  readiness,
} from "@/lib/connectors";
import { getDatabaseStatus } from "@/lib/hydradb";

export const dynamic = "force-dynamic";

// Typed as ProviderId (not string) so the parsed value flows straight into
// createConnector without a cast.
const createSchema = z.object({
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
});

/**
 * Setup-page bootstrap: which providers have credentials, which connectors
 * already exist, and whether the database is provisioned yet.
 */
export async function GET() {
  return handler(async () => {
    const providers = readiness();

    // A missing API key must not blank the page — the UI still needs to render
    // the credential checklist so the user knows what to fix.
    const [database, connectors] = await Promise.all([
      getDatabaseStatus().catch(() => ({
        exists: false,
        readyForIngestion: false,
      })),
      listConnectors().catch(() => []),
    ]);

    return ok({ providers, connectors, database });
  });
}

export async function POST(request: Request) {
  return handler(async () => {
    const parsed = await parseBody(request, createSchema);
    if (!parsed.ok) return parsed.response;

    const connector = await createConnector(parsed.data.provider);
    return ok({ connector }, { status: 201 });
  });
}
