import { createLogger } from "@engenty/telemetry";
import {
  type AiGatewayModelStore,
  syncGatewayModels,
} from "./gateway-models.js";

const logger = createLogger({ name: "apps/ai/gateway-model-sync" });
const DEFAULT_INTERVAL_MS = 86_400_000;

function envFlag(name: string): boolean | null {
  const value = process.env[name];
  if (value == null || value === "") {
    return null;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envInteger(name: string): number | null {
  const value = process.env[name];
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function startGatewayModelSyncScheduler(
  store: AiGatewayModelStore
): Promise<() => void> {
  const settings = await store.getGatewayModelSyncSettings().catch((err) => {
    logger.warn("Gateway model sync settings unavailable", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  const enabled = envFlag("AI_GATEWAY_MODEL_SYNC_ENABLED") ?? settings?.enabled;
  if (!enabled) {
    return () => undefined;
  }
  const intervalMs =
    envInteger("AI_GATEWAY_MODEL_SYNC_INTERVAL_MS") ??
    settings?.interval_ms ??
    DEFAULT_INTERVAL_MS;

  const runSync = async () => {
    try {
      const result = await syncGatewayModels(store, {
        trigger: "scheduled",
        updatePricing: envFlag("AI_GATEWAY_MODEL_SYNC_UPDATE_PRICING") ?? false,
      });
      await store.markGatewayModelSyncSettingsRun(
        result.run.completed_at ?? new Date().toISOString()
      );
      logger.info("Gateway model sync completed", {
        insertedPricingCount: result.inserted_pricing_count,
        modelCount: result.model_count,
        updatedModelCount: result.updated_model_count,
      });
    } catch (err) {
      await store.markGatewayModelSyncSettingsRun(null).catch(() => undefined);
      logger.warn("Gateway model sync failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (envFlag("AI_GATEWAY_MODEL_SYNC_RUN_ON_START")) {
    void runSync();
  }
  const timer = setInterval(runSync, intervalMs);
  timer.unref?.();
  logger.info("Gateway model sync scheduler enabled", { intervalMs });
  return () => clearInterval(timer);
}
