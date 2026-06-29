#!/usr/bin/env node
/**
 * Fetches models from Vercel AI Gateway and writes supported-embedding-models.json
 * (entries with type === "embedding").
 *
 * Usage:
 *   pnpm --filter @engenty/ai-core embedding:update
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "ai-core/embedding-provider-update" });
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const DATA_DIR = join(PACKAGE_ROOT, "data");
const OUTPUT_PATH = join(DATA_DIR, "supported-embedding-models.json");

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/models";

interface GatewayModel {
  id: string;
  name?: string;
  owned_by?: string;
  type?: string;
}

interface GatewayResponse {
  data?: GatewayModel[];
}

async function fetchModels(): Promise<GatewayModel[]> {
  const res = await fetch(GATEWAY_URL);
  if (!res.ok) {
    throw new Error(`Gateway fetch failed: ${res.status}`);
  }
  const json = (await res.json()) as GatewayResponse;
  return json.data ?? [];
}

export async function run() {
  const all = await fetchModels();
  const embeddingModels = all.filter((m) => m.type === "embedding");

  embeddingModels.sort((a, b) => a.id.localeCompare(b.id));

  const output = {
    models: embeddingModels.map((m) => ({
      id: m.id,
      provider: m.owned_by ?? m.id.split("/")[0] ?? "unknown",
      name: m.name ?? m.id,
    })),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  logger.info("Wrote embedding models", {
    count: output.models.length,
    path: OUTPUT_PATH,
  });
}

const script = process.argv[1] ?? "";
if (script.includes("embedding-provider-update")) {
  run().catch((err) => {
    logger.error("Embedding provider update failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
