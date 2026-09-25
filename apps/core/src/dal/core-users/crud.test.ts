import { describe, expect, it } from "vitest";
import {
  deleteUser,
  getUserById,
  getUsersByIds,
  listUsers,
  updateUser,
} from "./crud.js";

/**
 * The private columns on `core.users` that must never reach a read. Kept as a
 * literal list rather than derived from anything, so that widening the
 * projection has to fail here loudly.
 */
const PRIVATE_COLUMNS = [
  "private_phone",
  "private_email",
  "private_address",
  "emergency_contact",
  "employee_number",
];

describe("core.users projection", () => {
  /** Captures the column list handed to `.select()` — the SELECT list is the access control. */
  function captureSelect() {
    const selected: string[] = [];
    const terminal = {
      eq: () => terminal,
      in: () => terminal,
      order: () => Promise.resolve({ error: null, data: [] }),
      maybeSingle: () => Promise.resolve({ error: null, data: null }),
      single: () => Promise.resolve({ error: null, data: null }),
    };
    const client = {
      schema: () => ({
        from: () => ({
          select: (columns: string) => {
            selected.push(columns);
            return terminal;
          },
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: (columns: string) => {
                  selected.push(columns);
                  return {
                    single: () =>
                      Promise.resolve({
                        error: null,
                        data: {
                          id: "u1",
                          tenant_id: "t1",
                          role: "member",
                          is_super_admin: false,
                        },
                      }),
                  };
                },
              }),
            }),
          }),
        }),
      }),
    };
    return { client, selected };
  }

  it("never selects the private columns on any read path", async () => {
    const { client, selected } = captureSelect();

    await listUsers(client as never, "t1");
    await getUserById(client as never, "u1", "t1");
    await getUsersByIds(client as never, ["u1"], { tenantId: "t1" });
    await updateUser(client as never, "u1", "t1", { display_name: "X" });

    expect(selected).toHaveLength(4);
    for (const columns of selected) {
      expect(columns).not.toBe("*");
      for (const column of PRIVATE_COLUMNS) {
        expect(columns).not.toContain(column);
      }
    }
  });
});

describe("deleteUser", () => {
  it("deletes core user and auth user", async () => {
    let coreDeleted = false;
    let authDeleted = false;
    const client = {
      schema: () => ({
        from: () => ({
          delete: () => ({
            eq: () => ({
              eq: () => {
                coreDeleted = true;
                return Promise.resolve({ error: null });
              },
            }),
          }),
        }),
      }),
    };
    const identityAdmin = {
      deleteUser: async () => {
        authDeleted = true;
      },
    } as never;
    await deleteUser(client as never, "u1", "t1", identityAdmin);
    expect(coreDeleted).toBe(true);
    expect(authDeleted).toBe(true);
  });
});
