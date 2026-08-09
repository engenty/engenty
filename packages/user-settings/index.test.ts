import { describe, expect, it, vi } from "vitest";
import registerUserSettingsPlugin from "./index.js";

describe("registerUserSettingsPlugin", () => {
  it("exports a default EngentyPluginFactory", () => {
    expect(typeof registerUserSettingsPlugin).toBe("function");
  });

  it("registers HTTP routes when a database adapter exists", () => {
    const registerHttpRoute = vi.fn();
    const getServiceDb = vi.fn(() => ({}));
    const getTenantDb = vi.fn(() => ({}));
    registerUserSettingsPlugin({
      server: { getServiceDb, getTenantDb, registerHttpRoute },
    } as never);
    expect(registerHttpRoute).toHaveBeenCalledTimes(5);
  });

  it("no-ops when database adapter is missing", () => {
    const registerHttpRoute = vi.fn();
    const getServiceDb = vi.fn(() => null);
    // no getTenantDb: the tenant lane is what gates registration now
    registerUserSettingsPlugin({
      server: { getServiceDb, registerHttpRoute },
    } as never);
    expect(registerHttpRoute).not.toHaveBeenCalled();
  });
});
