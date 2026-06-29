import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPluginCreatePostSteps } from "./plugin-create-post-steps.js";
import type { PluginCreateAnswers } from "./plugin-create-types.js";

const workspaceAnswers = (): PluginCreateAnswers => ({
  description: "Test module.",
  displayName: "Acme Widget",
  includeUi: true,
  serverRoutes: true,
  slug: "acme-widget",
  uiLoad: "workspace",
});

describe("runPluginCreatePostSteps", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("wires apps/ui dependency and runs install + generate by default", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-repo-"));
    tempDirs.push(repoRoot);
    const modulesDir = path.join(repoRoot, "modules");
    const uiDir = path.join(repoRoot, "apps/ui");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(
      path.join(uiDir, "package.json"),
      `${JSON.stringify({ name: "@engenty/ui", dependencies: {} }, null, 2)}\n`,
      "utf8"
    );

    const commands: string[][] = [];
    const result = runPluginCreatePostSteps({
      answers: workspaceAnswers(),
      modulesDir,
      runCommand: ({ args }) => {
        commands.push([...args]);
        return { ok: true, output: "" };
      },
    });

    expect(result.wiredUiDependency).toBe("added");
    expect(result.ranInstall).toBe(true);
    expect(result.ranGeneratePlugins).toBe(true);
    expect(result.errors).toEqual([]);
    expect(commands).toEqual([
      ["install"],
      ["--filter", "@engenty/ui", "generate:plugins"],
    ]);
  });

  it("skips pnpm commands when skipInstall is set", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-repo-"));
    tempDirs.push(repoRoot);
    const modulesDir = path.join(repoRoot, "modules");
    const uiDir = path.join(repoRoot, "apps/ui");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(
      path.join(uiDir, "package.json"),
      `${JSON.stringify({ name: "@engenty/ui", dependencies: {} }, null, 2)}\n`,
      "utf8"
    );

    const result = runPluginCreatePostSteps({
      answers: workspaceAnswers(),
      modulesDir,
      skipInstall: true,
      runCommand: () => {
        throw new Error("pnpm should not run");
      },
    });

    expect(result.wiredUiDependency).toBe("added");
    expect(result.ranInstall).toBe(false);
    expect(result.ranGeneratePlugins).toBe(false);
    expect(
      result.messages.some((line) => line.includes("Skipped pnpm install"))
    ).toBe(true);
  });

  it("does nothing for server-only modules", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-repo-"));
    tempDirs.push(repoRoot);
    const modulesDir = path.join(repoRoot, "modules");
    fs.mkdirSync(modulesDir, { recursive: true });

    const result = runPluginCreatePostSteps({
      answers: { ...workspaceAnswers(), includeUi: false },
      modulesDir,
      runCommand: () => {
        throw new Error("pnpm should not run");
      },
    });

    expect(result.wiredUiDependency).toBe(false);
    expect(result.ranInstall).toBe(false);
    expect(result.ranGeneratePlugins).toBe(false);
  });
});
