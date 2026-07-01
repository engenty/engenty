import { describe, expect, it, vi } from "vitest";
import { bootstrapGatewayModelsIfEmpty } from "../gateway-model-sync-scheduler.js";
import type { AiGatewayModelStore } from "../gateway-models.js";

describe("bootstrapGatewayModelsIfEmpty", () => {
  it("skips sync when the catalog already has models", async () => {
    const listGatewayModels = vi.fn(async () => [
      { model_id: "openai/gpt-5-mini" },
    ]);
    const insertGatewayModelSyncRun = vi.fn();
    const store = {
      listGatewayModels,
      insertGatewayModelSyncRun,
      markGatewayModelSyncSettingsRun: vi.fn(),
      updateGatewayModelSyncRun: vi.fn(),
      upsertGatewayModels: vi.fn(),
    } as unknown as AiGatewayModelStore;

    const synced = await bootstrapGatewayModelsIfEmpty(store);

    expect(synced).toBe(false);
    expect(insertGatewayModelSyncRun).not.toHaveBeenCalled();
  });
});
