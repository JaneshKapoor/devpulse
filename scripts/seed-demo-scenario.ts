/**
 * Seeds the featured multi-channel demo scenario into HydraDB.
 *
 *     npm run seed:demo
 *
 * Each record is ingested as a `knowledge` document into the collection that
 * matches its provider (slack records into `slack`, and so on), tagged with
 * provider metadata so the UI attributes and links them exactly as it would
 * connector-synced data.
 *
 * This is deliberately NOT pretending to be a connector sync — it is a
 * guaranteed-present dataset so the hard cross-source questions demo reliably
 * even when the presenter's live workspace has no such pattern today. Real
 * connectors remain the primary path; this supplements them.
 *
 * Safe to re-run — ingesting again simply re-indexes the same titles.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { DEMO_RECORDS, renderRecord } = await import("../lib/demo-scenario");
  const { hydra, getDatabaseStatus } = await import("../lib/hydradb");
  const { HYDRA_DATABASE } = await import("../lib/env");

  const database = HYDRA_DATABASE();

  console.log(`\n  DevPulse → seeding demo scenario into "${database}"\n`);

  const status = await getDatabaseStatus();
  if (!status.exists) {
    console.error(
      "  ✗ Database does not exist yet. Run `npm run setup:hydradb` first.\n"
    );
    process.exit(1);
  }
  if (!status.readyForIngestion) {
    console.error(
      "  ✗ Database is still provisioning. Wait for `npm run setup:hydradb` to report ready.\n"
    );
    process.exit(1);
  }

  const client = hydra();
  const sourceIds: string[] = [];
  let failures = 0;

  for (let index = 0; index < DEMO_RECORDS.length; index++) {
    const record = DEMO_RECORDS[index];
    const label = `[${String(index + 1).padStart(2)}/${DEMO_RECORDS.length}] ${record.collection.padEnd(7)} ${record.title.slice(0, 46)}`;

    try {
      // Node 22 provides File natively; the SDK accepts it as an Uploadable.
      const filename = `${record.externalId ?? record.title}`
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 60);
      const file = new File([renderRecord(record)], `${filename}.md`, {
        type: "text/markdown",
      });

      const response = await client.context.ingest({
        database,
        collection: record.collection,
        type: "knowledge",
        documents: file,
        // A JSON-encoded *array*, one entry per document in `documents`, and
        // each entry is a fixed envelope — arbitrary keys at the top level are
        // rejected with INVALID_INPUT. Everything of ours goes under
        // `additional_metadata`, which is what the query layer reads back.
        documentMetadata: JSON.stringify([
          {
            additional_metadata: {
              provider: record.provider,
              source: "devpulse_demo_seed",
              title: record.title,
              url: record.url,
              author: record.author,
              timestamp: record.timestamp,
              external_id: record.externalId,
              ...record.metadata,
            },
          },
        ]),
      });

      const results = (response as any)?.data?.results ?? [];
      for (const item of results) {
        const id = item?.source_id ?? item?.sourceId ?? item?.id;
        if (id) sourceIds.push(String(id));
      }

      console.log(`  ✓ ${label}`);
    } catch (error: any) {
      failures++;
      console.log(`  ✗ ${label}`);
      console.log(`      ${error?.message ?? error}`);
    }
  }

  console.log(
    `\n  Ingested ${DEMO_RECORDS.length - failures}/${DEMO_RECORDS.length} records.`
  );

  if (!sourceIds.length) {
    console.log(
      "\n  No source IDs returned, so indexing cannot be polled here.\n" +
        "  Give it a minute, then try a question on the dashboard.\n"
    );
    return;
  }

  console.log("  Waiting for indexing to complete…\n");

  const started = Date.now();
  const TIMEOUT_MS = 240_000;

  for (;;) {
    const response = await client.context.status({ ids: sourceIds, database });
    const statuses = (response as any)?.data?.statuses ?? [];
    const done = statuses.filter((s: any) =>
      /complete|indexed|failed|error/i.test(
        String(s.indexing_status ?? s.indexingStatus ?? s.status ?? "")
      )
    ).length;

    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`    [${String(elapsed).padStart(3)}s] ${done}/${sourceIds.length} indexed`);

    if (done >= sourceIds.length) break;
    if (Date.now() - started > TIMEOUT_MS) {
      console.log("\n  Indexing is taking longer than expected — continuing anyway.");
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(
    "\n  ✓ Demo scenario seeded.\n\n" +
      "  Try this on the dashboard:\n" +
      '    "What has the manager asked Janesh to do today, across which\n' +
      '     channels, and where has he responded?"\n\n' +
      "  Expected: one request duplicated across Gmail, Slack and Linear;\n" +
      "  Linear ENG-482 is the tracked record; the only reply is in Slack.\n"
  );
}

main().catch((error) => {
  console.error(`\n  ✗ Seeding failed: ${error?.message ?? error}\n`);
  process.exit(1);
});
