import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";
import {
  type EnvDocument,
  parseEnvDocument,
  serializeEnvDocument,
} from "./env-file-document.js";
import { ENV_SCOPES } from "./env-manifest.js";
import type { EnvScope } from "./env-manifest-types.js";

export function resolveWorkspaceRoot(): string {
  return findWorkspaceRootFrom(process.cwd());
}

export function envFilePath(workspaceRoot: string, scope: EnvScope): string {
  return path.join(workspaceRoot, ENV_SCOPES[scope].envFile);
}

export function exampleFilePath(
  workspaceRoot: string,
  scope: EnvScope
): string {
  return path.join(workspaceRoot, ENV_SCOPES[scope].exampleFile);
}

/** null when the live env file does not exist yet. */
export function loadScopeDocument(
  workspaceRoot: string,
  scope: EnvScope
): EnvDocument | null {
  const filePath = envFilePath(workspaceRoot, scope);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return parseEnvDocument(fs.readFileSync(filePath, "utf8"));
}

export function saveScopeDocument(
  workspaceRoot: string,
  scope: EnvScope,
  doc: EnvDocument
): void {
  const filePath = envFilePath(workspaceRoot, scope);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeEnvDocument(doc), "utf8");
}

export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "…";
  }
  return `${value.slice(0, 5)}…${value.slice(-2)}`;
}
