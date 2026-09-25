import { describe, expect, it, vi } from "vitest";
import { buildCoreUsersCreateInTenantMethod } from "../core-users/create-in-tenant-method.js";

const createUser = vi.hoisted(() => vi.fn());

vi.mock("../../../dal/core-users.js", () => ({
  createCoreUsersDal: () => ({ createUser }),
}));

const baseCtx = {
  config: {} as Record<string, unknown>,
  pluginConfig: {},
  dataDir: "",
  resolvePath: (p: string) => p,
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
};

describe("buildCoreUsersCreateInTenantMethod", () => {
  it("creates the user in the caller's tenant as a member by default", async () => {
    createUser.mockResolvedValueOnce({ id: "user-1" });
    const method = buildCoreUsersCreateInTenantMethod({});
    await method.handler(
      {
        display_name: "Test",
        email: "t@example.com",
        password: "hunter2",
      },
      {
        ...baseCtx,
        auth: {
          principalId: "p1",
          tenantId: "tenant-1",
          scopeId: "s1",
        },
      }
    );
    expect(createUser).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ role: "member" })
    );
  });
});
