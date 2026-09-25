import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENGENTY_PLUGIN_MANIFEST_FILENAME,
  loadPluginManifest,
} from "./manifest.js";

describe("loadPluginManifest", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects unknown placement values", () => {
    // A typo'd placement must fail loudly: the default it would fall back to
    // decides whether the module appears on the app rail at all.
    tmpDir = path.join(os.tmpdir(), `engenty-manifest-${randomUUID()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "plugin-entry.ts"), "export {};");
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "bad-placement",
        placement: "globl",
        server: { entry: "./plugin-entry.ts" },
      })
    );

    const result = loadPluginManifest(tmpDir);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("plugin.manifest.invalid");
  });
});
