import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { moduleTier, tryReadClosedPrefixes } from "./lib/closed-prefixes.mjs";
import { moduleHasUi, resolveEnabledModules } from "./lib/engenty-modules.mjs";
import { syncUiModuleDependencies } from "./lib/sync-ui-module-deps.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function uiDependencies(): Record<string, string> {
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, "apps/ui/package.json"), "utf-8")
  ) as { dependencies?: Record<string, string> };
  return pkg.dependencies ?? {};
}

describe("sync-ui-module-deps", () => {
  it("is a no-op on a clean checkout", () => {
    // The property that broke: `moduleHasUi` read a manifest field no module
    // declares, so every module looked UI-less and the sync deleted all 18
    // module dependencies from a committed file. It stayed invisible because
    // node_modules was already linked — until an install ran after a setup,
    // and Vite could no longer resolve `@engenty/files-ui/...`.
    const before = uiDependencies();
    const result = syncUiModuleDependencies(repoRoot);

    expect(result.removed).toEqual([]);
    expect(result.added).toEqual([]);
    expect(uiDependencies()).toEqual(before);
  });

  it("sees the UI that modules actually ship", () => {
    const enabled = resolveEnabledModules(repoRoot, { strict: false });
    const withUi = enabled.filter((mod) => mod.hasUi);

    // Most enabled modules contribute a UI; zero means detection is broken
    // again, which is exactly how this failed silently before.
    expect(withUi.length).toBeGreaterThan(enabled.length / 2);
  });

  it("detects a UI from the convention file, not just the manifest", () => {
    // How nearly every module declares it: `ui/plugin.ts` on disk, with
    // nothing in the manifest saying so.
    const files = resolveEnabledModules(repoRoot, { strict: false }).find(
      (mod) => mod.slug === "files"
    );
    expect(files).toBeDefined();
    if (!files) {
      return;
    }
    expect(files.manifest?.ui).toBeUndefined();
    expect(files.manifest?.capabilities?.ui).toBeUndefined();
    expect(moduleHasUi(files.manifest, files.dir)).toBe(true);
    // Without the directory there is nothing to go on — which is what the
    // sync used to call.
    expect(moduleHasUi(files.manifest)).toBe(false);
  });

  it("uses each module's own package name, not one derived from the slug", () => {
    // modules/files is @engenty/files-ui; writing @engenty/files into
    // apps/ui/package.json would break `pnpm install`.
    const enabled = resolveEnabledModules(repoRoot, { strict: false });
    for (const slug of ["files", "pdf-templates"]) {
      const mod = enabled.find((m) => m.slug === slug);
      expect(mod, `${slug} should resolve`).toBeDefined();
      if (!mod) {
        continue;
      }
      const declared = JSON.parse(
        readFileSync(path.join(mod.dir, "package.json"), "utf-8")
      ) as { name: string };
      expect(mod.packageName).toBe(declared.name);
    }
  });

  it("classifies closed modules as pro", () => {
    // The closed list moved to closed-paths.mjs; the reader kept parsing a
    // bash array that had become a shell loop, so every module read as open
    // and closed UI packages were eligible for the open manifest.
    const prefixes = tryReadClosedPrefixes(repoRoot);
    expect(prefixes.length).toBeGreaterThan(0);
    expect(moduleTier("modules/banking", prefixes)).toBe("pro");
    expect(moduleTier("modules/tasks", prefixes)).toBe("open");
  });

  it("keeps closed modules out of the open UI manifest", () => {
    const deps = Object.keys(uiDependencies());
    for (const closed of [
      "@engenty/banking",
      "@engenty/expenses",
      "@engenty/time-tracking",
    ]) {
      expect(deps, `${closed} must not reach the public mirror`).not.toContain(
        closed
      );
    }
  });
});
