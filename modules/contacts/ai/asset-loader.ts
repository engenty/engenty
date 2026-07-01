import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveAiAsset(importMetaUrl: string, relativePath: string): string {
  const here = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    join(here, relativePath),
    join(here, "..", "..", "ai", relativePath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not find AI asset: ${relativePath}`);
}

export function readAiTextAsset(
  importMetaUrl: string,
  relativePath: string
): string {
  return readFileSync(resolveAiAsset(importMetaUrl, relativePath), "utf8");
}

export function readAiJsonAsset<T>(
  importMetaUrl: string,
  relativePath: string
): T {
  return JSON.parse(readAiTextAsset(importMetaUrl, relativePath)) as T;
}
