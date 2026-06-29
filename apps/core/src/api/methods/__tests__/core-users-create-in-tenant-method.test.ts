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
  it("exposes stable method name", () => {
    const method = buildCoreUsersCreateInTenantMethod({});
    expect(method.name).toBe("core_users_create_in_tenant");
  });

  it("creates user when tenant auth is present", async () => {
    createUser.mockResolvedValueOnce({ id: "user-1" });
    const method = buildCoreUsersCreateInTenantMethod({});
    const result = await method.handler(
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
    expect(result).toEqual({ id: "user-1" });
    expect(createUser).toHaveBeenCalledWith("tenant-1", {
      display_name: "Test",
      email: "t@example.com",
      password: "hunter2",
      role: "member",
    });
  });

  it("throws without tenant context", async () => {
    const method = buildCoreUsersCreateInTenantMethod({});
    await expect(
      method.handler(
        {
          display_name: "Test",
          email: "t@example.com",
          password: "hunter2",
        },
        { ...baseCtx, auth: undefined }
      )
    ).rejects.toThrow("Tenant context required");
  });
});
