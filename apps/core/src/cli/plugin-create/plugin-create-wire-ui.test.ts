import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addUiWorkspaceDependency } from "./plugin-create-wire-ui.js";

describe("addUiWorkspaceDependency", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("adds a sorted workspace dependency entry", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ui-wire-"));
    tempDirs.push(dir);
    const uiPackageJsonPath = path.join(dir, "package.json");
    fs.writeFileSync(
      uiPackageJsonPath,
      `${JSON.stringify(
        {
          name: "@engenty/ui",
          dependencies: {
            "@engenty/contacts": "workspace:*",
            "@engenty/z-last": "workspace:*",
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = addUiWorkspaceDependency({
      packageName: "@engenty/acme-widget",
      uiPackageJsonPath,
    });

    expect(result).toBe("added");
    const next = JSON.parse(fs.readFileSync(uiPackageJsonPath, "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(next.dependencies)).toEqual([
      "@engenty/acme-widget",
      "@engenty/contacts",
      "@engenty/z-last",
    ]);
    expect(next.dependencies["@engenty/acme-widget"]).toBe("workspace:*");
  });

  it("returns exists when the dependency is already present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ui-wire-"));
    tempDirs.push(dir);
    const uiPackageJsonPath = path.join(dir, "package.json");
    fs.writeFileSync(
      uiPackageJsonPath,
      `${JSON.stringify(
        {
          dependencies: {
            "@engenty/acme-widget": "workspace:*",
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    expect(
      addUiWorkspaceDependency({
        packageName: "@engenty/acme-widget",
        uiPackageJsonPath,
      })
    ).toBe("exists");
  });
});
