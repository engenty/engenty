import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverPlugins, resolveModulesDir } from "./discovery";
import { ENGENTY_PLUGIN_MANIFEST_FILENAME } from "./manifest";

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-discovery-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("discoverPlugins", () => {
  let tmpRoot: string;

  afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns empty when modules dir does not exist", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "nonexistent");
    const result = discoverPlugins({ modulesDir });
    expect(result.candidates).toEqual([]);
  });

  it("returns empty when modules dir is empty", () => {
    tmpRoot = makeTempDir();
    const modulesDir = tmpRoot;
    const result = discoverPlugins({ modulesDir });
    expect(result.candidates).toEqual([]);
  });

  it("finds package plugin when manifest omits server.entry but conventional entry exists", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(packagesDir, "foo");
    fs.mkdirSync(path.join(pluginDir, "src"), { recursive: true });
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@engenty/foo",
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "foo",
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "src", "plugin.ts"),
      "export default function registerFoo() {};"
    );

    const result = discoverPlugins({ modulesDir, packagesDir });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].idHint).toBe("foo");
    expect(result.candidates[0].source).toContain(
      path.join("src", "plugin.ts")
    );
    expect(result.candidates[0].rootDir).toBe(pluginDir);
    expect(result.candidates[0].packageName).toBe("@engenty/foo");
    expect(result.candidates[0].sourceType).toBe("package");
  });

  it("skips package helper libraries without explicit plugin metadata", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const helperDir = path.join(packagesDir, "helper");
    fs.mkdirSync(helperDir, { recursive: true });
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(helperDir, "package.json"),
      JSON.stringify({ name: "@engenty/helper" })
    );
    fs.writeFileSync(
      path.join(helperDir, "index.ts"),
      "export const helper = 1;"
    );

    const result = discoverPlugins({ modulesDir, packagesDir });
    expect(result.candidates).toEqual([]);
  });

  it("prefers engenty.plugin.json server.entry over conventional src/plugin.ts", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const pluginDir = path.join(modulesDir, "target");
    fs.mkdirSync(path.join(pluginDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@engenty/target",
      })
    );
    fs.writeFileSync(path.join(pluginDir, "index.js"), "export default {};");
    fs.writeFileSync(
      path.join(pluginDir, "src", "plugin.ts"),
      "export default {};"
    );
    fs.writeFileSync(
      path.join(pluginDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "target",
        server: { entry: "./src/plugin.ts" },
      })
    );

    const result = discoverPlugins({ modulesDir });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source).toContain(
      path.join("src", "plugin.ts")
    );
  });

  it("finds plugin with default index.ts", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const pluginDir = path.join(modulesDir, "bar");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({ name: "bar" })
    );
    fs.writeFileSync(path.join(pluginDir, "index.ts"), "export default {};");

    const result = discoverPlugins({ modulesDir });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].idHint).toBe("bar");
    expect(result.candidates[0].source).toContain("index.ts");
  });

  it("skips dirs without package.json", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const pluginDir = path.join(modulesDir, "no-pkg");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "index.ts"), "x");

    const result = discoverPlugins({ modulesDir });
    expect(result.candidates).toEqual([]);
  });
});

describe("resolveModulesDir", () => {
  it("returns a valid path", () => {
    const result = resolveModulesDir();
    expect(typeof result).toBe("string");
    expect(path.isAbsolute(result)).toBe(true);
  });
});
