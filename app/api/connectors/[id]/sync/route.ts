import { handler, ok } from "@/lib/api";
import { syncConnector } from "@/lib/connectors";

export const dynamic = "force-dynamic";

/**
 * Triggers an on-demand sync. The scheduler's default cadence is hourly, which
 * is too slow to demo against, so the UI calls this right after configure and
 * exposes it as a "Sync now" button.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handler(async () => {
    await syncConnector(params.id);
    return ok({ triggered: true, connectorId: params.id });
  });
}
