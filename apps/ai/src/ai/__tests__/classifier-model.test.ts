import { beforeEach, describe, expect, it, vi } from "vitest";

const listModelBindings = vi.fn();

vi.mock("../index.js", () => ({
  createAiUsageStoreFromEnv: () => ({ listModelBindings }),
}));

const { resolvePlatformClassifierModelId } = await import(
  "../classifier-model.js"
);

describe("resolvePlatformClassifierModelId", () => {
  beforeEach(() => {
    listModelBindings.mockReset();
  });

  it("returns null when bindings are empty (fresh DB after reset)", async () => {
    listModelBindings.mockResolvedValue([]);
    await expect(resolvePlatformClassifierModelId()).resolves.toBeNull();
  });

  it("returns the classifier binding without requiring chat roles", async () => {
    listModelBindings.mockResolvedValue([
      {
        gateway: "vercel",
        model_id: "typesafe-ai/jev",
        role: "classifier",
        scope: "platform",
      },
    ]);
    await expect(resolvePlatformClassifierModelId()).resolves.toBe(
      "typesafe-ai/jev"
    );
  });

  it("returns null when only unrelated roles are bound", async () => {
    listModelBindings.mockResolvedValue([
      {
        gateway: "vercel",
        model_id: "x",
        role: "model.medium",
        scope: "platform",
      },
    ]);
    await expect(resolvePlatformClassifierModelId()).resolves.toBeNull();
  });
});
