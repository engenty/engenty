import { describe, expect, it, vi } from "vitest";
import { registerUserSettingsApi } from "./index.js";

describe("registerUserSettingsApi", () => {
  it("registers collection and per-name routes for /api/user-settings", () => {
    const registered: {
      method: string;
      operation?: { operationId?: string; requiredCapabilities?: string[] };
      path: string;
    }[] = [];
    const server = {
      registerHttpRoute: vi.fn(
        (route: {
          method: string;
          operation?: {
            operationId?: string;
            requiredCapabilities?: string[];
          };
          path: string;
        }) => {
          registered.push({
            method: route.method,
            operation: route.operation,
            path: route.path,
          });
          return undefined;
        }
      ),
    };
    const repo = {
      get: vi.fn(),
      set: vi.fn(),
      list: vi.fn(),
      setMany: vi.fn(),
      delete: vi.fn(),
    };
    registerUserSettingsApi(server, repo);
    expect(server.registerHttpRoute).toHaveBeenCalledTimes(5);
    expect(registered).toContainEqual({
      method: "get",
      operation: expect.objectContaining({
        operationId: "user_settings_list",
        requiredCapabilities: ["user-settings.read"],
      }),
      path: "/api/user-settings",
    });
    expect(registered).toContainEqual({
      method: "patch",
      operation: expect.objectContaining({
        operationId: "user_settings_set_many",
        requiredCapabilities: ["user-settings.write"],
      }),
      path: "/api/user-settings",
    });
    expect(registered).toContainEqual({
      method: "get",
      operation: expect.objectContaining({
        operationId: "user_settings_get",
        requiredCapabilities: ["user-settings.read"],
      }),
      path: "/api/user-settings/:name",
    });
    expect(registered).toContainEqual({
      method: "patch",
      operation: expect.objectContaining({
        operationId: "user_settings_set",
        requiredCapabilities: ["user-settings.write"],
      }),
      path: "/api/user-settings/:name",
    });
  });
});
