import { describe, expect, it } from "vitest";
import { runImport } from "./import-runner.js";

describe("runImport", () => {
  it("tracks success and failed counts", async () => {
    const summary = await runImport({
      items: [1, 2, 3],
      onItem: async (value) => {
        if (value === 2) {
          throw new Error("fail");
        }
      },
    });
    expect(summary).toEqual({
      total: 3,
      processed: 3,
      success: 2,
      failed: 1,
      canceled: false,
    });
  });

  it("stops when shouldCancel returns true", async () => {
    let calls = 0;
    const summary = await runImport({
      items: [1, 2, 3, 4],
      onItem: async () => {
        calls += 1;
      },
      shouldCancel: () => calls >= 2,
    });
    expect(summary.canceled).toBe(true);
    expect(summary.processed).toBe(2);
  });
});
