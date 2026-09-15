import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";
import { engentyHome } from "../home.js";
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

/**
 * `findWorkspaceRootFrom` falls back to the directory it started in, so it
 * cannot say "no checkout". This can, which is what tells `env set` whether the
 * manifest it is validating against is the complete one: outside a checkout
 * there are no `engenty.plugin.json` files, so module-contributed variables
 * (AI_GATEWAY_API_KEY among them) are simply absent.
 */
export function currentWorkspaceRootOrNull(): string | null {
  const root = findWorkspaceRootFrom(process.cwd());
  return fs.existsSync(path.join(root, "pnpm-workspace.yaml")) ? root : null;
}

/**
 * `home` lives outside any checkout, so it resolves against ENGENTY_HOME and
 * ignores the workspace root callers pass for the other scopes.
 */
export function scopeBaseDir(workspaceRoot: string, scope: EnvScope): string {
  return scope === "home" ? engentyHome() : workspaceRoot;
}

export function envFilePath(workspaceRoot: string, scope: EnvScope): string {
  return path.join(
    scopeBaseDir(workspaceRoot, scope),
    ENV_SCOPES[scope].envFile
  );
}

export function exampleFilePath(
  workspaceRoot: string,
  scope: EnvScope
): string {
  return path.join(
    scopeBaseDir(workspaceRoot, scope),
    ENV_SCOPES[scope].exampleFile
  );
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
