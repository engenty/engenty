#!/usr/bin/env node
/**
 * Adds vendor slugs to vendors.json and runs provider:update.
 * Usage:
 *   pnpm run provider:add -- openai anthropic google mistral
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "ai-core/provider-add" });
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const DATA_DIR = join(PACKAGE_ROOT, "data");
const VENDORS_PATH = join(DATA_DIR, "vendors.json");

const DEFAULT_VENDORS = ["openai", "anthropic"];

function parseArgs(): string[] {
  const args = process.argv.slice(2);
  const dashIdx = args.indexOf("--");
  const afterDash = dashIdx >= 0 ? args.slice(dashIdx + 1) : args;
  return afterDash
    .filter((a) => !a.startsWith("-"))
    .map((v) => v.toLowerCase().trim())
    .filter(Boolean);
}

async function main() {
  const toAdd = parseArgs();
  if (toAdd.length === 0) {
    logger.error(
      "Usage: pnpm run provider:add -- openai anthropic google mistral"
    );
    process.exit(1);
  }

  let vendors: string[] = DEFAULT_VENDORS;
  try {
    const content = readFileSync(VENDORS_PATH, "utf-8");
    const json = JSON.parse(content) as { vendors?: string[] };
    vendors = json.vendors ?? vendors;
  } catch {
    // file missing, use defaults
  }

  const set = new Set([...vendors, ...toAdd]);
  const updated = [...set].sort();

  writeFileSync(VENDORS_PATH, JSON.stringify({ vendors: updated }, null, 2));
  logger.info("Updated vendors", { vendors: updated });

  // Run provider:update
  const { run } = await import("./provider-update.js");
  await run();
}

main().catch((err) => {
  logger.error("Provider add failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
