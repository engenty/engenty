import path from "node:path";
import { pathToFileURL } from "node:url";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

export interface SchemaProbe {
  error?: string;
  exposed?: string[];
  missing?: string[];
  ok: boolean;
}

export interface SelfCheckProbe {
  checks?: Record<string, unknown>;
  error?: string;
  hookReady?: boolean;
  ok: boolean;
  rpcMissing?: boolean;
}

interface ProbesModule {
  probeDeploymentSelfCheck: (args: {
    url: string;
    serviceRoleKey: string;
  }) => Promise<SelfCheckProbe>;
  probeExposedSchemas: (args: {
    url: string;
    anonKey: string;
    required?: string[];
  }) => Promise<SchemaProbe>;
}

/**
 * The probes and the schema composer live in `scripts/` as plain .mjs, because
 * the deploy wizard runs them straight from a clone with no install. Import
 * them from there rather than keeping a second copy that can disagree with the
 * one an operator actually runs.
 */
async function importFromScripts<T>(relativePath: string): Promise<T> {
  const repoRoot = findWorkspaceRootFrom(process.cwd());
  const href = pathToFileURL(path.join(repoRoot, relativePath)).href;
  return (await import(href)) as T;
}

export async function loadRequiredSchemas(): Promise<string[]> {
  const repoRoot = findWorkspaceRootFrom(process.cwd());
  const owners = await importFromScripts<{
    resolveMigrationOwners: (root: string) => unknown[];
  }>("scripts/lib/migration-owners.mjs");
  const sync = await importFromScripts<{
    composeApiSchemasFromOwners: (owners: unknown[]) => string[];
  }>("scripts/supabase-sync-lib.mjs");
  return sync.composeApiSchemasFromOwners(
    owners.resolveMigrationOwners(repoRoot)
  );
}

export async function loadProbes(): Promise<ProbesModule> {
  return await importFromScripts<ProbesModule>(
    "scripts/lib/supabase-probes.mjs"
  );
}
