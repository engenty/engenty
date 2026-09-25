import { describe, expect, it, vi } from "vitest";
import { ensureDefaultTenant } from "./tenants.js";

describe("ensureDefaultTenant", () => {
  // A user without a tenant must join the existing one, never split off a second.
  it("joins the oldest existing tenant without creating one", async () => {
    const insert = vi.fn();
    const client = {
      schema: () => ({
        from: () => ({
          insert,
          select: () => ({
            order: () => ({
              limit: async () => ({ data: [{ id: "t1" }], error: null }),
            }),
          }),
        }),
      }),
    } as never;
    await expect(ensureDefaultTenant(client)).resolves.toBe("t1");
    expect(insert).not.toHaveBeenCalled();
  });
});
