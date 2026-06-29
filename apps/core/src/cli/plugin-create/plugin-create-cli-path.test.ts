import { describe, expect, it } from "vitest";
import { shouldDeferPluginBoot } from "./plugin-create-cli-path.js";

describe("shouldDeferPluginBoot", () => {
  it("returns true for plugins create invocations", () => {
    expect(
      shouldDeferPluginBoot(["node", "engenty", "plugins", "create", "acme"])
    ).toBe(true);
    expect(
      shouldDeferPluginBoot(["node", "engenty", "plugins", "create", "--help"])
    ).toBe(true);
    expect(
      shouldDeferPluginBoot(["node", "engenty", "plugins", "wire-ui", "acme"])
    ).toBe(true);
  });

  it("returns false for other plugin commands", () => {
    expect(shouldDeferPluginBoot(["node", "engenty", "plugins", "list"])).toBe(
      false
    );
  });

  it("returns true for all env commands (must work with a broken env)", () => {
    expect(shouldDeferPluginBoot(["node", "engenty", "env", "init"])).toBe(
      true
    );
    expect(shouldDeferPluginBoot(["node", "engenty", "env", "check"])).toBe(
      true
    );
    expect(shouldDeferPluginBoot(["node", "engenty", "env"])).toBe(true);
  });

  it("does not defer when env is not the first argument", () => {
    expect(shouldDeferPluginBoot(["node", "engenty", "auth", "env"])).toBe(
      false
    );
  });
});
