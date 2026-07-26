import { seedBindings } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { AiGatewayModelStore } from "./gateway-models.js";

const logger = createLogger({ name: "apps/ai/model-binding-seed" });

/**
 * Populate `ai.model_binding` with any role that has never been bound.
 *
 * Runs on every boot rather than once, because the seed is additive by
 * construction — `seedModelBindings` ignores conflicts — so a role added in a
 * later release lands without its own migration. What it must never do is
 * reassert a default over an operator's binding, which is why the "insert only
 * what is missing" behaviour lives in the store rather than here.
 *
 * The legacy `AI_*_MODEL` env vars are read exactly once, here, so an existing
 * deployment keeps the models it was running before the upgrade.
 */
export async function seedModelBindingsIfMissing(
  store: AiGatewayModelStore,
  readEnv: (key: string) => string | undefined = (key) => process.env[key]
): Promise<number> {
  const rows = seedBindings(undefined, readEnv).map((binding) => ({
    gateway: binding.gateway,
    model_id: binding.modelId,
    role: binding.role,
    scope: "platform",
  }));
  const inserted = await store.seedModelBindings(rows);
  if (inserted > 0) {
    logger.info("Seeded model bindings", { count: inserted });
  }
  return inserted;
}
