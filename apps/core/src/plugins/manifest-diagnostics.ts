import fs from "node:fs";
import path from "node:path";
import type { PluginManifest, PluginManifestDiagnostic } from "./manifest.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function collectManifestDiagnostics(params: {
  diagnostics: PluginManifestDiagnostic[];
  manifest: PluginManifest;
  rootDir: string;
}) {
  const packageRaw = readJsonFile(path.join(params.rootDir, "package.json"));
  if (!isRecord(packageRaw)) {
    return;
  }

  const pkgVersion = normalizeString(packageRaw.version);
  const manifestVersion = params.manifest.version?.trim();
  if (pkgVersion && manifestVersion && pkgVersion !== manifestVersion) {
    params.diagnostics.push({
      code: "plugin.manifest.version_mismatch",
      level: "warn",
      message: `engenty.plugin.json version "${manifestVersion}" disagrees with package.json version "${pkgVersion}".`,
    });
  }
}
