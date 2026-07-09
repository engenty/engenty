import { describe, expect, it } from "vitest";
import { RoleProfileRegistry } from "./role-profiles.js";

const profile = (id: string, capabilities: string[] = []) => ({
  id,
  title: id,
  capabilities,
});

describe("RoleProfileRegistry", () => {
  it("registers and looks up profiles", () => {
    const r = new RoleProfileRegistry();
    r.register("core", profile("tenant.member", ["a", "b"]));
    expect(r.get("tenant.member")?.capabilities).toEqual(["a", "b"]);
    expect(r.pluginIdFor("tenant.member")).toBe("core");
    expect(r.get("missing")).toBeUndefined();
  });

  it("allows the same plugin to re-register an id (idempotent reload)", () => {
    const r = new RoleProfileRegistry();
    r.register("invoices", profile("invoices.clerk", ["x"]));
    expect(() =>
      r.register("invoices", profile("invoices.clerk", ["x", "y"]))
    ).not.toThrow();
    expect(r.get("invoices.clerk")?.capabilities).toEqual(["x", "y"]);
  });

  it("throws when a different plugin registers an existing id", () => {
    const r = new RoleProfileRegistry();
    r.register("invoices", profile("shared.role"));
    expect(() => r.register("contacts", profile("shared.role"))).toThrow(
      /already registered by invoices/
    );
  });

  it("removes a plugin's profiles on unload", () => {
    const r = new RoleProfileRegistry();
    r.register("core", profile("tenant.admin"));
    r.register("invoices", profile("invoices.clerk"));
    r.register("invoices", profile("invoices.auditor"));
    r.removeByPlugin("invoices");
    expect(r.get("invoices.clerk")).toBeUndefined();
    expect(r.get("invoices.auditor")).toBeUndefined();
    expect(r.get("tenant.admin")).toBeDefined();
    expect(r.list()).toHaveLength(1);
  });
});
