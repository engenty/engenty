import { describe, expect, it } from "vitest";
import { shouldDeferPluginBoot } from "./plugin-create-cli-path.js";

describe("shouldDeferPluginBoot", () => {
  it("returns true for bare engenty and global flags", () => {
    expect(shouldDeferPluginBoot(["node", "engenty"])).toBe(true);
    expect(shouldDeferPluginBoot(["node", "engenty", "--help"])).toBe(true);
    expect(shouldDeferPluginBoot(["node", "engenty", "-h"])).toBe(true);
  });

  it("returns true for all plugins subcommands (manifest + HTTP API)", () => {
    expect(shouldDeferPluginBoot(["node", "engenty", "plugins"])).toBe(true);
    expect(
      shouldDeferPluginBoot(["node", "engenty", "plugins", "create", "acme"])
    ).toBe(true);
    expect(
      shouldDeferPluginBoot(["node", "engenty", "plugins", "install", "--all"])
    ).toBe(true);
    expect(
      shouldDeferPluginBoot(["node", "engenty", "plugins", "uninstall", "leads"])
    ).toBe(true);
    expect(shouldDeferPluginBoot(["node", "engenty", "plugins", "list"])).toBe(
      true
    );
  });

  it("returns true for all env commands (must work with a broken env)", () => {
    expect(shouldDeferPluginBoot(["node", "engenty", "env", "init"])).toBe(
      true
    );
    expect(shouldDeferPluginBoot(["node", "engenty", "env"])).toBe(true);
  });

  it("returns true for bootstrap commands that must run before full plugin build", () => {
    expect(shouldDeferPluginBoot(["node", "engenty", "setup", "--local"])).toBe(
      true
    );
    expect(shouldDeferPluginBoot(["node", "engenty", "db", "migrate"])).toBe(
      true
    );
  });

  it("returns false when module CLI registrars may be required", () => {
    expect(shouldDeferPluginBoot(["node", "engenty", "auth", "env"])).toBe(
      false
    );
  });
});
