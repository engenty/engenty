import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listWorkspaceModulesOnDisk,
  modulePackageName,
  readEngentyPluginsManifest,
  resolveEnabledModules,
  resolveModuleDir,
  writeEngentyPluginsManifest,
} from "./engenty-modules.js";

function pluginsFromSlugs(slugs: string[]): Record<string, { source: string }> {
  return Object.fromEntries(
    slugs.map((slug) => [slug, { source: "workspace" }])
  );
}

describe("engenty-plugins manifest", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  function createRepo(slugs: string[]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-plugins-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "modules"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          workspaces: ["modules/*"],
          engenty: { plugins: pluginsFromSlugs(slugs) },
        },
        null,
        2
      )}\n`,
      "utf-8"
    );
    return root;
  }

  it("reads slug manifest from root package.json", () => {
    const root = createRepo(["engenty-copilot", "company-profile"]);
    expect(readEngentyPluginsManifest(root).slugs).toEqual([
      "engenty-copilot",
      "company-profile",
    ]);
  });

  it("reads legacy engenty.modules array during migration", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-legacy-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "modules"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          workspaces: ["modules/*"],
          engenty: { modules: ["alpha", "beta"] },
        },
        null,
        2
      )}\n`,
      "utf-8"
    );
    expect(readEngentyPluginsManifest(root).slugs).toEqual(["alpha", "beta"]);
  });

  it("resolves enabled modules on disk", () => {
    const root = createRepo(["alpha"]);
    const moduleDir = path.join(root, "modules", "alpha");
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(
      path.join(moduleDir, "engenty.plugin.json"),
      `${JSON.stringify({ id: "module.alpha", ui: { entry: "@engenty/alpha/ui" } }, null, 2)}\n`
    );

    const modules = resolveEnabledModules(root);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.packageName).toBe(modulePackageName("alpha"));
    expect(modules[0]?.hasUi).toBe(true);
  });

  function createRepoWithPlugins(plugins: Record<string, unknown>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-registry-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "modules"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        { workspaces: ["modules/*"], engenty: { plugins } },
        null,
        2
      )}\n`,
      "utf-8"
    );
    return root;
  }

  it("resolves a registry module from node_modules", () => {
    const root = createRepoWithPlugins({ gamma: { source: "registry" } });
    const installed = path.join(root, "node_modules", "@engenty", "gamma");
    writeManifest(installed, { id: "gamma", capabilities: { ui: true } });

    const modules = resolveEnabledModules(root);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.slug).toBe("gamma");
    expect(modules[0]?.source).toBe("registry");
    expect(modules[0]?.dir).toBe(installed);
    expect(modules[0]?.packageName).toBe("@engenty/gamma");
  });

  it("honors a package-name override for registry modules", () => {
    const root = createRepoWithPlugins({
      "pdf-templates": {
        source: "registry",
        package: "@engenty/pdf-templates-module",
      },
    });
    const installed = path.join(
      root,
      "node_modules",
      "@engenty",
      "pdf-templates-module"
    );
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(
      path.join(installed, "engenty.plugin.json"),
      `${JSON.stringify({ id: "pdf-templates" }, null, 2)}\n`
    );

    const modules = resolveEnabledModules(root);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.dir).toBe(installed);
    expect(modules[0]?.packageName).toBe("@engenty/pdf-templates-module");
  });

  it("throws when a registry module is not installed", () => {
    const root = createRepoWithPlugins({ delta: { source: "registry" } });
    expect(() => resolveEnabledModules(root)).toThrow(/not installed/);
  });

  it("rejects an unknown plugin source", () => {
    const root = createRepoWithPlugins({ epsilon: { source: "bogus" } });
    expect(() => resolveEnabledModules(root)).toThrow(/unknown source/);
  });

  function writeManifest(dir: string, manifest: Record<string, unknown>): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "engenty.plugin.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: modulePackageName(String(manifest.id)) }, null, 2)}\n`
    );
  }

  it("discovers nested connector providers by manifest id", () => {
    const root = createRepo(["connections", "connections-google"]);
    writeManifest(path.join(root, "modules", "connections"), {
      id: "connections",
    });
    writeManifest(
      path.join(root, "modules", "connections", "providers", "google"),
      { id: "connections-google" }
    );

    const onDisk = listWorkspaceModulesOnDisk(root);
    expect(onDisk.map((m) => m.slug)).toEqual([
      "connections",
      "connections-google",
    ]);
    expect(resolveModuleDir(root, "connections-google")).toBe(
      path.join(root, "modules", "connections", "providers", "google")
    );

    const modules = resolveEnabledModules(root);
    expect(modules.map((m) => m.slug).sort()).toEqual([
      "connections",
      "connections-google",
    ]);
    expect(
      modules.find((m) => m.slug === "connections-google")?.packageName
    ).toBe(modulePackageName("connections-google"));
  });

  it("throws when a nested provider omits its manifest id", () => {
    const root = createRepo(["connections"]);
    writeManifest(path.join(root, "modules", "connections"), {
      id: "connections",
    });
    const nested = path.join(
      root,
      "modules",
      "connections",
      "providers",
      "google"
    );
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "engenty.plugin.json"),
      `${JSON.stringify({ name: "Google" }, null, 2)}\n`
    );
    expect(() => listWorkspaceModulesOnDisk(root)).toThrow(/valid kebab-case/);
  });

  it("throws when a nested provider package name disagrees with its id", () => {
    const root = createRepo(["connections"]);
    writeManifest(path.join(root, "modules", "connections"), {
      id: "connections",
    });
    const nested = path.join(
      root,
      "modules",
      "connections",
      "providers",
      "google"
    );
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "engenty.plugin.json"),
      `${JSON.stringify({ id: "connections-google" }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(nested, "package.json"),
      `${JSON.stringify({ name: "@engenty/wrong-name" }, null, 2)}\n`
    );
    expect(() => listWorkspaceModulesOnDisk(root)).toThrow(/package name/);
  });

  it("writes updated plugin object", () => {
    const root = createRepo(["engenty-copilot"]);
    writeEngentyPluginsManifest(root, ["engenty-copilot", "company-profile"]);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    ) as { engenty: { plugins: Record<string, { source: string }> } };
    expect(Object.keys(pkg.engenty.plugins).sort()).toEqual([
      "company-profile",
      "engenty-copilot",
    ]);
    expect(pkg.engenty.plugins["company-profile"]).toEqual({
      source: "workspace",
    });
  });
});
