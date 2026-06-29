import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  modulePackageName,
  readEngentyPluginsManifest,
  resolveEnabledModules,
  writeEngentyPluginsManifest,
} from "./engenty-modules.js";

function pluginsFromSlugs(
  slugs: string[]
): Record<string, { source: string }> {
  return Object.fromEntries(slugs.map((slug) => [slug, { source: "workspace" }]));
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
