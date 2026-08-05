/**
 * One-time HydraDB database provisioning.
 *
 *     npm run setup:hydradb
 *
 * Creates the database named by HYDRA_DB_DATABASE and blocks until HydraDB
 * reports `infra.readyForIngestion`, because provisioning is asynchronous and
 * ingesting before it completes fails in confusing ways.
 *
 * Safe to re-run: an already-provisioned database short-circuits.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  // Imported after dotenv so the client sees the loaded credentials.
  const { createDatabase, getDatabaseStatus, waitForDatabaseReady } =
    await import("../lib/hydradb");
  const { HYDRA_DATABASE } = await import("../lib/env");

  const database = HYDRA_DATABASE();
  console.log(`\n  DevPulse → provisioning HydraDB database "${database}"\n`);

  const initial = await getDatabaseStatus();

  if (initial.exists && initial.readyForIngestion) {
    console.log("  ✓ Database already exists and is ready for ingestion.");
    console.log("    Nothing to do.\n");
    return;
  }

  if (!initial.exists) {
    console.log("  → Creating database…");
    await createDatabase();
    console.log("  ✓ Create accepted (provisioning is asynchronous).");
  } else {
    console.log("  → Database exists but is still provisioning.");
  }

  console.log("  → Waiting for infra.readyForIngestion…\n");

  let lastLine = "";
  const status = await waitForDatabaseReady({
    onTick: (s, elapsed) => {
      const line =
        `    [${String(Math.round(elapsed / 1000)).padStart(3)}s] ` +
        `graph=${fmt(s.graphStatus)} scheduler=${fmt(s.schedulerStatus)} ` +
        `ready=${fmt(s.readyForIngestion)}`;
      if (line !== lastLine) {
        console.log(line);
        lastLine = line;
      }
    },
  });

  console.log(`\n  ✓ Database "${database}" is ready for ingestion.`);
  if (status.message) console.log(`    ${status.message}`);
  console.log("\n  Next: open http://localhost:3000/setup to connect sources.\n");
}

function fmt(value: boolean | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "?";
}

main().catch((error) => {
  console.error("\n  ✗ HydraDB setup failed\n");
  console.error(`    ${error?.message ?? error}`);
  if (error?.body) {
    console.error(`    ${JSON.stringify(error.body).slice(0, 500)}`);
  }
  console.error(
    "\n    Check HYDRA_DB_API_KEY in .env.local, then retry with " +
      "`npm run setup:hydradb`.\n"
  );
  process.exit(1);
});
