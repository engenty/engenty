import { describe, expect, it } from "vitest";
import { coerceIsSuperAdmin, coerceRole } from "./helpers.js";

describe("coerceRole", () => {
  it("returns admin when value is admin", () => {
    expect(coerceRole("admin")).toBe("admin");
  });

  it("returns member for any other value", () => {
    expect(coerceRole("member")).toBe("member");
    expect(coerceRole("")).toBe("member");
    expect(coerceRole(null)).toBe("member");
    expect(coerceRole(undefined)).toBe("member");
    expect(coerceRole(123)).toBe("member");
  });
});

describe("coerceIsSuperAdmin", () => {
  it("returns true when value is true", () => {
    expect(coerceIsSuperAdmin(true)).toBe(true);
  });

  it("returns false for any other value", () => {
    expect(coerceIsSuperAdmin(false)).toBe(false);
    expect(coerceIsSuperAdmin(1)).toBe(false);
    expect(coerceIsSuperAdmin("true")).toBe(false);
    expect(coerceIsSuperAdmin(null)).toBe(false);
    expect(coerceIsSuperAdmin(undefined)).toBe(false);
  });
});
