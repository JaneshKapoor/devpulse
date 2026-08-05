import { handler, ok } from "@/lib/api";
import { clearMetrics, listMetrics, summarise } from "@/lib/metrics-store";

export const dynamic = "force-dynamic";

/** Backs the Metrics tab: every logged query plus the summary stat cards. */
export async function GET() {
  return handler(async () => {
    const metrics = await listMetrics();
    return ok({ metrics, summary: summarise(metrics) });
  });
}

/** Resets the log — useful for starting a clean demo run. */
export async function DELETE() {
  return handler(async () => {
    await clearMetrics();
    return ok({ cleared: true });
  });
}
