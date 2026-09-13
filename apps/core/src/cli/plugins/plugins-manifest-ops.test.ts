import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkPluginManifest,
  disablePluginsInProduct,
  enablePluginsInProduct,
  listPluginManifestEntries,
} from "./plugins-manifest-ops.js";

describe("plugins-manifest-ops", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  function createRepo(slugs: Record<string, { source: string }>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-plugins-cli-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "modules"), { recursive: true });
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "scripts/generate.mjs"),
      "// stub\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          workspaces: ["modules/*"],
          engenty: { plugins: slugs },
        },
        null,
        2
      )}\n`,
      "utf-8"
    );
    return root;
  }

  function writeModule(root: string, slug: string) {
    const moduleDir = path.join(root, "modules", slug);
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(
      path.join(moduleDir, "engenty.plugin.json"),
      `${JSON.stringify({ id: slug }, null, 2)}\n`,
      "utf-8"
    );
  }

  function readPlugins(root: string): Record<string, { source: string }> {
    return (
      JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
        engenty: { plugins: Record<string, { source: string }> };
      }
    ).engenty.plugins;
  }

  it("lists manifest entries with on-disk and enabled status", () => {
    const root = createRepo({
      alpha: { source: "workspace" },
      beta: { source: "workspace" },
    });
    writeModule(root, "alpha");
    const entries = listPluginManifestEntries(root);
    expect(entries).toEqual([
      { slug: "alpha", onDisk: true, enabled: true, hasUi: false },
      { slug: "beta", onDisk: false, enabled: true, hasUi: false },
    ]);
  });

  it("enables and disables slugs in engenty.plugins", () => {
    const root = createRepo({ alpha: { source: "workspace" } });
    writeModule(root, "beta");

    enablePluginsInProduct({
      repoRoot: root,
      slugs: ["beta"],
      runInstall: false,
      runSetup: false,
    });
    expect(readPlugins(root)).toEqual({
      alpha: { source: "workspace" },
      beta: { source: "workspace" },
    });

    disablePluginsInProduct({
      repoRoot: root,
      slugs: ["alpha"],
      runSetup: false,
    });
    expect(readPlugins(root)).toEqual({
      beta: { source: "workspace" },
    });
  });

  it("checkPluginManifest reports missing on-disk plugins", () => {
    const root = createRepo({ missing: { source: "workspace" } });
    const result = checkPluginManifest(root);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("missing");
  });
});
