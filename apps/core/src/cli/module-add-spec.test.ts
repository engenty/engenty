import { describe, expect, it } from "vitest";
import { parseModuleAddSpec } from "./module-add-spec.js";

describe("parseModuleAddSpec", () => {
  it("parses a scoped package with no version", () => {
    const spec = parseModuleAddSpec("@engenty/tasks");
    expect(spec.packageName).toBe("@engenty/tasks");
    expect(spec.version).toBeUndefined();
    expect(spec.slug).toBe("tasks");
    expect(spec.installArg).toBe("@engenty/tasks");
    expect(spec.pluginEntry).toEqual({ source: "registry" });
  });

  it("parses a scoped package with a version", () => {
    const spec = parseModuleAddSpec("@engenty/tasks@0.1.47");
    expect(spec.packageName).toBe("@engenty/tasks");
    expect(spec.version).toBe("0.1.47");
    expect(spec.slug).toBe("tasks");
    expect(spec.installArg).toBe("@engenty/tasks@0.1.47");
  });

  it("carries a package override when the name diverges from @engenty/<slug>", () => {
    const spec = parseModuleAddSpec(
      "@engenty/pdf-templates-module@0.1.47",
      "pdf-templates"
    );
    expect(spec.slug).toBe("pdf-templates");
    expect(spec.pluginEntry).toEqual({
      source: "registry",
      package: "@engenty/pdf-templates-module",
    });
  });

  it("accepts an unscoped name and a dist-tag", () => {
    const spec = parseModuleAddSpec("contacts@latest");
    expect(spec.packageName).toBe("contacts");
    expect(spec.version).toBe("latest");
    expect(spec.slug).toBe("contacts");
    expect(spec.pluginEntry).toEqual({
      source: "registry",
      package: "contacts",
    });
  });

  it("rejects an empty argument", () => {
    expect(() => parseModuleAddSpec("  ")).toThrow(/package name is required/);
  });

  it("rejects a non-kebab-case slug without an override", () => {
    expect(() => parseModuleAddSpec("@engenty/Tasks_Bad")).toThrow(
      /not a valid kebab-case slug/
    );
  });
});
