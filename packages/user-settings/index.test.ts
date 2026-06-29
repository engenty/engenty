import { describe, expect, it, vi } from "vitest";
import registerUserSettingsPlugin from "./index.js";

describe("registerUserSettingsPlugin", () => {
  it("exports a default EngentyPluginFactory", () => {
    expect(typeof registerUserSettingsPlugin).toBe("function");
  });

  it("registers HTTP routes when a database adapter exists", () => {
    const registerHttpRoute = vi.fn();
    const getDatabaseAdapter = vi.fn(() => ({}));
    registerUserSettingsPlugin({
      server: { getDatabaseAdapter, registerHttpRoute },
    } as never);
    expect(registerHttpRoute).toHaveBeenCalledTimes(5);
  });

  it("no-ops when database adapter is missing", () => {
    const registerHttpRoute = vi.fn();
    const getDatabaseAdapter = vi.fn(() => null);
    registerUserSettingsPlugin({
      server: { getDatabaseAdapter, registerHttpRoute },
    } as never);
    expect(registerHttpRoute).not.toHaveBeenCalled();
  });
});
