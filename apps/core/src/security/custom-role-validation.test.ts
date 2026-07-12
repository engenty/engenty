import { describe, expect, it } from "vitest";
import { validateCustomRole } from "./custom-role-validation.js";

const admin = ["*"];

describe("validateCustomRole", () => {
  it("accepts an explicit capability list for a well-formed custom id", () => {
    const r = validateCustomRole({
      roleId: "custom.billing",
      capabilities: ["module.invoices.read", "module.invoices.write"],
      creatorCapabilities: admin,
    });
    expect(r.ok).toBe(true);
    expect(r.capabilities).toEqual([
      "module.invoices.read",
      "module.invoices.write",
    ]);
  });

  it("rejects non-custom role ids", () => {
    const r = validateCustomRole({
      roleId: "invoices.clerk",
      capabilities: ["module.invoices.read"],
      creatorCapabilities: admin,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/custom\.<slug>/);
  });

  it("rejects wildcards of every shape", () => {
    for (const cap of ["*", "core.*", "module.*", "core.superadmin"]) {
      const r = validateCustomRole({
        roleId: "custom.x",
        capabilities: [cap],
        creatorCapabilities: admin,
      });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects capabilities the creator does not hold (clamp)", () => {
    const r = validateCustomRole({
      roleId: "custom.x",
      capabilities: ["module.invoices.read", "module.secret.write"],
      creatorCapabilities: ["module.invoices.read"],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/may not delegate/);
  });

  it("rejects capabilities absent from the catalog", () => {
    const r = validateCustomRole({
      roleId: "custom.x",
      capabilities: ["module.invoices.raed"],
      creatorCapabilities: admin,
      catalog: new Set(["module.invoices.read"]),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/not in catalog/);
  });

  it("requires at least one capability", () => {
    const r = validateCustomRole({
      roleId: "custom.x",
      capabilities: [],
      creatorCapabilities: admin,
    });
    expect(r.ok).toBe(false);
  });
});
