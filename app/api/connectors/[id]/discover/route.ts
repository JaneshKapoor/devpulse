import { handler, ok } from "@/lib/api";
import { discoverResources } from "@/lib/connectors";

export const dynamic = "force-dynamic";

/** Lists the resources this connector's account can see, before activation. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return handler(async () => {
    const resources = await discoverResources(params.id);
    return ok({ resources, count: resources.length });
  });
}
