import { describe, expect, it } from "vitest";
import { ensureDefaultTenant } from "./tenants.js";

describe("ensureDefaultTenant", () => {
  it("returns tenant id after upsert and select", async () => {
    const client = {
      schema: () => ({
        from: () => ({
          upsert: async () => ({ error: null }),
          select: () => ({
            eq: () => ({
              single: async () => ({ error: null, data: { id: "tenant-1" } }),
            }),
          }),
        }),
      }),
    };

    await expect(ensureDefaultTenant(client as never)).resolves.toBe(
      "tenant-1"
    );
  });

  it("throws when tenant lookup fails", async () => {
    const client = {
      schema: () => ({
        from: () => ({
          upsert: async () => ({ error: null }),
          select: () => ({
            eq: () => ({
              single: async () => ({
                error: new Error("select failed"),
                data: null,
              }),
            }),
          }),
        }),
      }),
    };

    await expect(ensureDefaultTenant(client as never)).rejects.toThrow(
      "select failed"
    );
  });
});
