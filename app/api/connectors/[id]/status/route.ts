import { handler, ok } from "@/lib/api";
import { getConnector } from "@/lib/connectors";

export const dynamic = "force-dynamic";

/** Polled by the setup UI while a sync is in flight. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handler(async () => {
    const connector = await getConnector(params.id);
    return ok({ connector });
  });
}
