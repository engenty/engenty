#!/usr/bin/env node
/**
 * Fetches models from Vercel AI Gateway and writes supported-models.json.
 * Usage:
 *   pnpm run provider:update                    # update all vendors from vendors.json
 *   pnpm run provider:update -- --vendor openai # update only openai
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "ai-core/provider-update" });
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const DATA_DIR = join(PACKAGE_ROOT, "data");
const VENDORS_PATH = join(DATA_DIR, "vendors.json");
const MODELS_PATH = join(DATA_DIR, "supported-models.json");

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/models";

interface GatewayModel {
  context_window?: number;
  id: string;
  name?: string;
  owned_by?: string;
}

interface GatewayResponse {
  data?: GatewayModel[];
  object?: string;
}

function parseArgs(): { vendors: string[] } {
  const args = process.argv.slice(2);
  const vendorIdx = args.indexOf("--vendor");
  if (vendorIdx >= 0 && args[vendorIdx + 1]) {
    return { vendors: [args[vendorIdx + 1]!] };
  }
  try {
    const content = readFileSync(VENDORS_PATH, "utf-8");
    const json = JSON.parse(content) as { vendors?: string[] };
    return { vendors: json.vendors ?? [] };
  } catch {
    return { vendors: [] };
  }
}

async function fetchModels(): Promise<GatewayModel[]> {
  const res = await fetch(GATEWAY_URL);
  if (!res.ok) {
    throw new Error(`Gateway fetch failed: ${res.status}`);
  }
  const json = (await res.json()) as GatewayResponse;
  return json.data ?? [];
}

function filterByVendors(
  models: GatewayModel[],
  vendors: string[]
): GatewayModel[] {
  if (vendors.length === 0) {
    return models;
  }
  const prefixes = vendors.map((v) => `${v.toLowerCase()}/`);
  return models.filter((m) =>
    prefixes.some((p) => m.id.toLowerCase().startsWith(p))
  );
}

export async function run() {
  const { vendors } = parseArgs();
  if (vendors.length === 0) {
    throw new Error(
      "No vendors. Use --vendor openai or add vendors via provider:add."
    );
  }

  const all = await fetchModels();
  const filtered = filterByVendors(all, vendors);

  const output = {
    models: filtered.map((m) => ({
      id: m.id,
      provider: m.owned_by ?? m.id.split("/")[0] ?? "unknown",
      context_length: m.context_window ?? null,
    })),
  };

  writeFileSync(MODELS_PATH, JSON.stringify(output, null, 2));
  logger.info("Wrote models", { count: filtered.length, path: MODELS_PATH });
}

// Run when executed directly (pnpm run provider:update)
const script = process.argv[1] ?? "";
if (script.includes("provider-update") && !script.includes("provider-add")) {
  run().catch((err) => {
    logger.error("Provider update failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
