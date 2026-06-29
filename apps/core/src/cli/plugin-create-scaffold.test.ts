import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectPluginScaffoldFiles,
  slugToCamelCase,
  slugToPascalCase,
  writePluginScaffold,
} from "./plugin-create/plugin-create-scaffold.js";
import type { PluginCreateAnswers } from "./plugin-create/plugin-create-types.js";
import {
  isValidKebabPluginSlug,
  slugFromDisplayName,
  validateNewPluginSlug,
} from "./plugin-create/plugin-create-validate.js";
import { resolveNonInteractivePluginCreate } from "./plugin-create/plugin-create-wizard.js";

const baseAnswers = (): PluginCreateAnswers => ({
  description: "Test module.",
  displayName: "Acme Widget",
  includeUi: true,
  serverRoutes: true,
  slug: "acme-widget",
  uiLoad: "workspace",
});

describe("plugin create scaffold", () => {
  it("slugToPascalCase maps kebab-case segments", () => {
    expect(slugToPascalCase("acme-widget")).toBe("AcmeWidget");
    expect(slugToCamelCase("acme-widget")).toBe("acmeWidget");
  });

  it("validateNewPluginSlug rejects conflicts", () => {
    const err = validateNewPluginSlug({
      existingSlugs: ["hello-world", "acme-widget"],
      slug: "hello-world",
    });
    expect(err).toContain("already exists");
  });

  it("isValidKebabPluginSlug rejects invalid tokens", () => {
    expect(isValidKebabPluginSlug("MyPlugin")).toBe(false);
    expect(isValidKebabPluginSlug("ok-2")).toBe(true);
  });

  it("slugFromDisplayName derives kebab-case plugin ids", () => {
    expect(slugFromDisplayName("Invoice Hub")).toBe("invoice-hub");
    expect(slugFromDisplayName("  My Cool Feature!  ")).toBe("my-cool-feature");
  });

  it("collectPluginScaffoldFiles emits convention-first manifest + workspace UI", () => {
    const files = collectPluginScaffoldFiles(baseAnswers());
    const rel = new Set(files.map((f) => f.relativePath));
    expect(rel.has("engenty.plugin.json")).toBe(true);
    expect(rel.has("src/plugin.ts")).toBe(true);
    expect(rel.has("src/api/index.ts")).toBe(true);
    expect(rel.has("ui/plugin.ts")).toBe(true);
    expect(rel.has("ui/pages/acme-widget-page.tsx")).toBe(true);
    expect(rel.has("ui/acme-widget.css")).toBe(true);
    const manifest = JSON.parse(
      files.find((f) => f.relativePath === "engenty.plugin.json")?.content ??
        "{}"
    ) as {
      server?: unknown;
      ui?: { entry?: string; load?: string; tailwindSources?: string[] };
    };
    expect(manifest.server).toBeUndefined();
    expect(manifest.ui).toBeUndefined();
    expect(manifest).not.toHaveProperty("capabilities");

    const apiFile = files.find((f) => f.relativePath === "src/api/index.ts");
    expect(apiFile?.content).toContain("hello_message");
  });

  it("collectPluginScaffoldFiles skips UI when disabled", () => {
    const files = collectPluginScaffoldFiles({
      ...baseAnswers(),
      includeUi: false,
    });
    const rel = new Set(files.map((f) => f.relativePath));
    expect(rel.has("ui/plugin.ts")).toBe(false);
    expect(rel.has("src/api/index.ts")).toBe(true);
  });

  it("writePluginScaffold writes files to disk", () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-plugin-create-")
    );
    const answers: PluginCreateAnswers = {
      ...baseAnswers(),
      slug: "tmp-widget",
      includeUi: false,
      serverRoutes: false,
    };
    const files = collectPluginScaffoldFiles(answers);
    writePluginScaffold({ files, moduleRootDir: dir });
    expect(fs.existsSync(path.join(dir, "src/plugin.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "engenty.plugin.json"))).toBe(true);
    fs.rmSync(dir, { force: true, recursive: true });
  });

  it("resolveNonInteractivePluginCreate returns structured answers", () => {
    const res = resolveNonInteractivePluginCreate({
      existingSlugs: [],
      initialSlug: "green-field",
    });
    expect(res.error).toBeUndefined();
    expect(res.value?.slug).toBe("green-field");
    expect(res.value?.includeUi).toBe(true);
  });
});
