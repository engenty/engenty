import { describe, expect, it, vi } from "vitest";
import { ensureDefaultTenant } from "./tenants.js";

/**
 * Minimal PostgREST builder stand-in: `select().order().limit()` resolves to
 * the list, `insert().select().single()` to the created row.
 */
function clientWith(params: {
  insert?: { data: { id: string } | null; error: Error | null };
  lists: Array<{ data: Array<{ id: string }> | null; error?: Error }>;
}) {
  const lists = [...params.lists];
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () =>
        params.insert ?? { data: { id: "created" }, error: null },
    }),
  }));
  return {
    insert,
    client: {
      schema: () => ({
        from: () => ({
          insert,
          select: () => ({
            order: () => ({
              limit: async () => lists.shift() ?? { data: [], error: null },
            }),
          }),
        }),
      }),
    } as never,
  };
}

describe("ensureDefaultTenant", () => {
  it("joins the oldest existing tenant without creating one", async () => {
    const { client, insert } = clientWith({
      lists: [{ data: [{ id: "t1" }] }],
    });
    await expect(ensureDefaultTenant(client)).resolves.toBe("t1");
    expect(insert).not.toHaveBeenCalled();
  });

  // The wizard renames the first tenant, slug included. Looking the tenant up
  // by `slug = "default"` is what made the next sign-up create a second one.
  it("does not care what the existing tenant is called", async () => {
    const { client } = clientWith({ lists: [{ data: [{ id: "acme" }] }] });
    await expect(ensureDefaultTenant(client)).resolves.toBe("acme");
  });

  it("creates the first tenant on an empty installation", async () => {
    const { client, insert } = clientWith({ lists: [{ data: [] }] });
    await expect(ensureDefaultTenant(client)).resolves.toBe("created");
    expect(insert).toHaveBeenCalled();
  });

  it("reads back the winner when two first sign-ups race", async () => {
    const { client } = clientWith({
      insert: { data: null, error: new Error("duplicate key value") },
      lists: [{ data: [] }, { data: [{ id: "winner" }] }],
    });
    await expect(ensureDefaultTenant(client)).resolves.toBe("winner");
  });

  it("throws when the insert fails and nothing is there", async () => {
    const { client } = clientWith({
      insert: { data: null, error: new Error("insert failed") },
      lists: [{ data: [] }, { data: [] }],
    });
    await expect(ensureDefaultTenant(client)).rejects.toThrow("insert failed");
  });
});
