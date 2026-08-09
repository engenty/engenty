import { describe, expect, it, vi } from "vitest";
import registerTenantSettingsPlugin, {
  registerTenantSettingsApi,
} from "./index.js";

describe("registerTenantSettingsApi", () => {
  it("registers collection and per-name routes for /api/tenant-settings", () => {
    const registered: { method: string; path: string }[] = [];
    const server = {
      registerHttpRoute: vi.fn((route: { method: string; path: string }) => {
        registered.push({ method: route.method, path: route.path });
      }),
    };
    const repo = {
      get: vi.fn(),
      set: vi.fn(),
      list: vi.fn(),
      setMany: vi.fn(),
    };
    registerTenantSettingsApi(server, repo);
    expect(server.registerHttpRoute).toHaveBeenCalledTimes(4);
    expect(registered).toContainEqual({
      method: "get",
      path: "/api/tenant-settings",
    });
    expect(registered).toContainEqual({
      method: "patch",
      path: "/api/tenant-settings",
    });
    expect(registered).toContainEqual({
      method: "get",
      path: "/api/tenant-settings/:name",
    });
    expect(registered).toContainEqual({
      method: "patch",
      path: "/api/tenant-settings/:name",
    });
  });
});

describe("registerTenantSettingsPlugin", () => {
  it("exports a default EngentyPluginFactory", () => {
    expect(typeof registerTenantSettingsPlugin).toBe("function");
  });

  it("registers HTTP routes when a database adapter exists", () => {
    const registerHttpRoute = vi.fn();
    const getServiceDb = vi.fn(() => ({}));
    const getTenantDb = vi.fn(() => ({}));
    registerTenantSettingsPlugin({
      server: { getServiceDb, getTenantDb, registerHttpRoute },
    } as never);
    expect(registerHttpRoute).toHaveBeenCalledTimes(4);
  });

  it("no-ops when database adapter is missing", () => {
    const registerHttpRoute = vi.fn();
    const getServiceDb = vi.fn(() => null);
    registerTenantSettingsPlugin({
      server: { getServiceDb, registerHttpRoute },
    } as never);
    expect(registerHttpRoute).not.toHaveBeenCalled();
  });
});
