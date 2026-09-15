import {
  AI_PLATFORM_ROLES,
  BINDING_PACK_GATEWAY_PREFERENCE,
  gatewayIdFromApiKeyEnvName,
  isStockPlatformBindings,
  listRegisteredModelRoles,
  mergeDeclaredRoles,
  seedBindings,
  seedGatewayFromEnv,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { AiGatewayModelStore } from "./gateway-models.js";

const logger = createLogger({ name: "apps/ai/model-binding-seed" });

const PLATFORM_ROLES = AI_PLATFORM_ROLES.map((spec) => spec.role);

function desiredRows(
  readEnv: (key: string) => string | undefined,
  gateway: string
) {
  const roles = mergeDeclaredRoles(listRegisteredModelRoles());
  return seedBindings(roles, readEnv, gateway).map((binding) => ({
    gateway: binding.gateway,
    model_id: binding.modelId,
    role: binding.role,
    scope: "platform" as const,
  }));
}

/**
 * Populate `ai.model_binding` with any role that has never been bound.
 *
 * Insert-only: never overwrites a bound role. Skips when no gateway key is
 * set, so a clean setup does not pin Vercel rows before the wizard picks a
 * provider.
 */
export async function seedModelBindingsIfMissing(
  store: AiGatewayModelStore,
  readEnv: (key: string) => string | undefined = (key) => process.env[key]
): Promise<number> {
  const gateway = seedGatewayFromEnv(readEnv);
  if (!gateway) {
    return 0;
  }
  const inserted = await store.seedModelBindings(desiredRows(readEnv, gateway));
  if (inserted > 0) {
    logger.info("Seeded model bindings", { count: inserted, gateway });
  }
  return inserted;
}

/**
 * First-run wizard / platform key save: if the table is still a shipped pack
 * (or empty), switch it to the pack for the gateway that was just connected.
 * A console rebind is left alone.
 */
export async function applyBindingPackForProvider(
  store: AiGatewayModelStore,
  envKeys: readonly string[],
  readEnv: (key: string) => string | undefined = (key) => process.env[key]
): Promise<number> {
  const connected = new Set(
    envKeys
      .map((key) => gatewayIdFromApiKeyEnvName(key))
      .filter((id): id is string => id !== null)
  );
  const gateway = BINDING_PACK_GATEWAY_PREFERENCE.find((id) =>
    connected.has(id)
  );
  if (!gateway) {
    return 0;
  }
  const current = (await store.listModelBindings("platform")).map((row) => ({
    gateway: row.gateway,
    modelId: row.model_id,
    role: row.role,
  }));
  if (!isStockPlatformBindings(current, PLATFORM_ROLES)) {
    return 0;
  }
  const rows = desiredRows(readEnv, gateway);
  for (const row of rows) {
    await store.upsertModelBinding(row);
  }
  logger.info("Applied model-binding pack", { count: rows.length, gateway });
  return rows.length;
}
