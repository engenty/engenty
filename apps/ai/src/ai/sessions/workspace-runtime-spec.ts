// Builds the Mastra workspace runtime spec for a run from explicit capability
// flags (no agent-type branching). Callers expand an `AgentConfig.workspace`
// declaration into a mount table + flags and pass them here.
//
// Agents use named mounts only (`/home`, `/shared`, `/skills`, `/task`). There
// is no `/` root mount and no unscoped-filesystem shape: an agent sees exactly
// what its mount table grants. Sandbox staging paths are derived per mount by
// the loader, not anchored to a spec-level base path.

import { getEngentyCoreBaseUrlFromEnv } from "../core-http-client.js";
import type { EngentyWorkspaceMountSpec } from "../workspace/contracts.js";
import { resolveEngentyWorkspaceFsMode } from "../workspace/workspace-fs-mode.js";
import { type AiSessionScope, scopeAccessToken } from "./types.js";

// Mastra requires a valid SQL identifier for the vector index name. Derive a
// stable per-tenant name so ephemeral per-run workspaces reuse one persisted
// index instead of re-embedding skills on every run.
function tenantSearchIndexName(tenantId: string): string {
  const sanitized = tenantId.replace(/[^a-zA-Z0-9_]/g, "_");
  return `skills_${sanitized}`.slice(0, 63);
}

export function resolveEngentyWorkspaceRuntimeSpec(input: {
  agentId: string;
  bm25?: boolean;
  enableSandbox?: boolean;
  enableSkillSearch?: boolean;
  enableVector?: boolean;
  mounts: EngentyWorkspaceMountSpec[];
  sandboxConfig?: {
    lifecycle?: "run" | "session" | "task";
    mountPath?: string;
    provider?: "docker" | "local";
    timeoutMs?: number;
  };
  sandboxIdentity?: {
    runId: string;
    taskIdentifier?: string;
    tenantId: string;
    threadId: string;
  };
  sandboxRequireApproval?: boolean;
  scope: AiSessionScope;
  skillDiscoveryPaths?: string[];
}) {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const accessToken = scopeAccessToken(input.scope)?.trim();

  return {
    agentConfig: {
      id: input.agentId,
      instructions: "",
      model: "openai/gpt-4.1-mini",
      name: input.agentId,
      tenantId: input.scope.tenantId,
    },
    bm25: input.bm25,
    enableSandbox: input.enableSandbox ?? false,
    enableSkillSearch: input.enableSkillSearch ?? false,
    enableVector: input.enableVector ?? false,
    searchIndexName: tenantSearchIndexName(input.scope.tenantId),
    sandboxConfig: input.sandboxConfig,
    sandboxIdentity: input.sandboxIdentity,
    sandboxRequireApproval: input.sandboxRequireApproval ?? true,
    ...(input.skillDiscoveryPaths
      ? { skillDiscoveryPaths: input.skillDiscoveryPaths }
      : {}),
    // Bearer-backed file storage adapter — when missing the loader falls back
    // to LocalFilesystem so dev/tests still work without a core token.
    ...(coreBaseUrl && accessToken
      ? {
          fileStorageAccess: {
            coreBaseUrl,
            accessToken,
          },
        }
      : {}),
    mounts: input.mounts,
    workspaceFsMode: resolveEngentyWorkspaceFsMode(),
  };
}
