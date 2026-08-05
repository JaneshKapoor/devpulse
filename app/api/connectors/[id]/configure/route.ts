import { z } from "zod";

import { handler, ok, parseBody } from "@/lib/api";
import {
  PROVIDER_IDS,
  type ProviderId,
  configureConnector,
} from "@/lib/connectors";

export const dynamic = "force-dynamic";

const configureSchema = z.object({
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
  resources: z
    .array(
      z.object({
        resourceId: z.string().min(1),
        name: z.string().min(1),
        resourceType: z.string().optional(),
      })
    )
    .min(1, "select at least one resource to sync"),
  // 30 days of history is enough to answer "last sprint vs this sprint"
  // without making the first backfill unreasonably slow.
  lookbackDays: z.number().int().min(1).max(365).default(30),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handler(async () => {
    const parsed = await parseBody(request, configureSchema);
    if (!parsed.ok) return parsed.response;

    const { provider, resources, lookbackDays } = parsed.data;
    await configureConnector(params.id, provider, resources, lookbackDays);

    return ok({ configured: resources.length, lookbackDays });
  });
}
