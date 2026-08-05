/**
 * Print the Fireworks models your account can actually call.
 *
 *     npm run list-models
 *
 * Fireworks' serverless catalogue changes often — model IDs that were current
 * a few months ago get retired. Rather than hardcoding a guess, this asks the
 * API and prints IDs you can paste straight into FIREWORKS_MODEL_ID.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const apiKey = process.env.FIREWORKS_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("your_")) {
    console.error(
      "\n  ✗ FIREWORKS_API_KEY is not set in .env.local\n" +
        "    Get one at https://app.fireworks.ai/settings/users/api-keys\n"
    );
    process.exit(1);
  }

  const response = await fetch("https://api.fireworks.ai/inference/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fireworks returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { data?: Array<{ id: string }> };
  const models = (payload.data ?? []).map((m) => m.id).sort();

  if (!models.length) {
    console.log("\n  No models returned for this account.\n");
    return;
  }

  console.log(`\n  ${models.length} model(s) available to this account:\n`);

  // Surface the instruction-following families that suit DevPulse's synthesis
  // step first, since that is what the env var actually needs.
  const preferred = models.filter((id) =>
    /kimi|deepseek|qwen|llama|mixtral|gpt-oss/i.test(id)
  );
  const rest = models.filter((id) => !preferred.includes(id));

  if (preferred.length) {
    console.log("  Recommended for DevPulse synthesis:");
    for (const id of preferred) console.log(`    ${id}`);
    console.log("");
  }
  if (rest.length) {
    console.log("  Others:");
    for (const id of rest) console.log(`    ${id}`);
    console.log("");
  }

  console.log(
    "  Paste one into .env.local as:\n" +
      `    FIREWORKS_MODEL_ID=${preferred[0] ?? models[0]}\n`
  );
}

main().catch((error) => {
  console.error(`\n  ✗ Could not list Fireworks models: ${error?.message ?? error}\n`);
  process.exit(1);
});
