import { describe, expect, it } from "vitest";
import {
  deleteUser,
  getTenantById,
  getUserById,
  listUsers,
  updateUser,
} from "./crud.js";

function makeClient(
  overrides: {
    users?: {
      select?: () => unknown;
      update?: () => unknown;
      delete?: () => unknown;
    };
    tenants?: { select?: () => unknown };
    auth?: { admin?: { deleteUser?: () => unknown } };
  } = {}
) {
  const base = {
    schema: () => ({
      from: (table: string) => {
        if (table === "users") {
          return {
            select: overrides.users?.select ?? (() => ({ eq: () => ({}) })),
            update:
              overrides.users?.update ??
              (() => ({ eq: () => ({ eq: () => ({}) }) })),
            delete:
              overrides.users?.delete ??
              (() => ({ eq: () => ({ eq: () => ({}) }) })),
            insert: () => ({}),
          };
        }
        if (table === "tenants") {
          return {
            select: overrides.tenants?.select ?? (() => ({ eq: () => ({}) })),
          };
        }
        return {};
      },
    }),
    auth: {
      admin: {
        deleteUser:
          overrides.auth?.admin?.deleteUser ?? (async () => ({ error: null })),
      },
    },
  };
  return base;
}

describe("listUsers", () => {
  it("returns users when rows exist", async () => {
    const rows = [
      {
        id: "u1",
        tenant_id: "t1",
        role: "admin",
        is_super_admin: false,
        email: "a@x.com",
        display_name: "A",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      },
    ];
    const client = makeClient({
      users: {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ error: null, data: rows }),
          }),
        }),
      },
    });
    const result = await listUsers(client as never, "t1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("u1");
    expect(result[0].role).toBe("admin");
  });

  it("returns empty array when no rows", async () => {
    const client = makeClient({
      users: {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ error: null, data: [] }),
          }),
        }),
      },
    });
    const result = await listUsers(client as never, "t1");
    expect(result).toEqual([]);
  });

  it("throws when query errors", async () => {
    const err = new Error("db error");
    const client = makeClient({
      users: {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ error: err, data: null }),
          }),
        }),
      },
    });
    await expect(listUsers(client as never, "t1")).rejects.toThrow("db error");
  });
});

describe("getUserById", () => {
  it("returns user when found", async () => {
    const row = {
      id: "u1",
      tenant_id: "t1",
      role: "member",
      is_super_admin: false,
      email: "a@x.com",
      display_name: "A",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
    };
    const client = makeClient({
      users: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ error: null, data: row }),
            }),
          }),
        }),
      },
    });
    const result = await getUserById(client as never, "u1", "t1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("u1");
    expect(result!.role).toBe("member");
  });

  it("returns null when not found", async () => {
    const client = makeClient({
      users: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ error: null, data: null }),
            }),
          }),
        }),
      },
    });
    const result = await getUserById(client as never, "u1", "t1");
    expect(result).toBeNull();
  });

  it("throws when query errors", async () => {
    const err = new Error("db error");
    const client = makeClient({
      users: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ error: err, data: null }),
            }),
          }),
        }),
      },
    });
    await expect(getUserById(client as never, "u1", "t1")).rejects.toThrow(
      "db error"
    );
  });
});

describe("getTenantById", () => {
  it("returns tenant when found", async () => {
    const row = { id: "t1", slug: "acme", name: "Acme Inc" };
    const client = makeClient({
      tenants: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ error: null, data: row }),
          }),
        }),
      },
    });
    const result = await getTenantById(client as never, "t1");
    expect(result).toEqual({ id: "t1", slug: "acme", name: "Acme Inc" });
  });

  it("returns null when not found", async () => {
    const client = makeClient({
      tenants: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ error: null, data: null }),
          }),
        }),
      },
    });
    const result = await getTenantById(client as never, "t1");
    expect(result).toBeNull();
  });
});

describe("updateUser", () => {
  it("returns updated user", async () => {
    const updated = {
      id: "u1",
      tenant_id: "t1",
      role: "admin",
      is_super_admin: false,
      email: "a@x.com",
      display_name: "Updated",
      created_at: "2024-01-01",
      updated_at: "2024-01-02",
    };
    const client = makeClient({
      users: {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ error: null, data: updated }),
              }),
            }),
          }),
        }),
      },
    });
    const result = await updateUser(client as never, "u1", "t1", {
      display_name: "Updated",
    });
    expect(result.display_name).toBe("Updated");
    expect(result.id).toBe("u1");
  });

  it("throws when query errors", async () => {
    const err = new Error("update failed");
    const client = makeClient({
      users: {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ error: err, data: null }),
              }),
            }),
          }),
        }),
      },
    });
    await expect(
      updateUser(client as never, "u1", "t1", { display_name: "X" })
    ).rejects.toThrow("update failed");
  });
});

describe("deleteUser", () => {
  it("deletes core user and auth user", async () => {
    let coreDeleted = false;
    let authDeleted = false;
    const client = makeClient({
      users: {
        delete: () => ({
          eq: () => ({
            eq: () => {
              coreDeleted = true;
              return Promise.resolve({ error: null });
            },
          }),
        }),
      },
    });
    const identityAdmin = {
      deleteUser: async () => {
        authDeleted = true;
      },
    } as never;
    await deleteUser(client as never, "u1", "t1", identityAdmin);
    expect(coreDeleted).toBe(true);
    expect(authDeleted).toBe(true);
  });

  it("throws when core delete fails", async () => {
    const err = new Error("core delete failed");
    const client = makeClient({
      users: {
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: err }),
          }),
        }),
      },
    });
    const identityAdmin = { deleteUser: async () => {} } as never;
    await expect(
      deleteUser(client as never, "u1", "t1", identityAdmin)
    ).rejects.toThrow("core delete failed");
  });

  it("throws when auth delete fails", async () => {
    const err = new Error("auth delete failed");
    const client = makeClient({
      users: {
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      },
    });
    const identityAdmin = {
      deleteUser: async () => {
        throw err;
      },
    } as never;
    await expect(
      deleteUser(client as never, "u1", "t1", identityAdmin)
    ).rejects.toThrow("auth delete failed");
  });
});
