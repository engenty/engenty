// Builds the Mastra workspace runtime spec for a run from explicit capability
// flags (no agent-type branching). Callers expand an `AgentConfig.workspace`
// declaration into a mount table + flags and pass them here.
//
// Agents use named mounts only (`/home`, `/shared`, `/skills`, `/task`) — there
// is no `/` root mount, so we omit Mastra's implicit tenant-root mount
// (`omitRootMount: true`). The staging base path anchors to the `/sandbox` or
// `/home` mount for sandbox executor cwd resolution.

import { getEngentyCoreBaseUrlFromEnv } from "../core-http-client.js";
import type { EngentyWorkspaceMountSpec } from "../workspace/contracts.js";
import {
  resolveLocalMountBasePath,
  resolveTenantLocalWorkspaceBasePath,
} from "../workspace/local-workspace-paths.js";
import { resolveEngentyWorkspaceFsMode } from "../workspace/workspace-fs-mode.js";
import type { AiSessionScope } from "./types.js";

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
    provider?: "docker" | "local" | "gondolin";
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
  const userAccessToken = input.scope.userAccessToken?.trim();
  const homeMount = input.mounts.find((mount) => mount.mountPath === "/home");
  const sandboxMount = input.mounts.find(
    (mount) =>
      mount.mountPath === (input.sandboxConfig?.mountPath ?? "/sandbox")
  );

  return {
    agentConfig: {
      id: input.agentId,
      instructions: "",
      model: "openai/gpt-4.1-mini",
      name: input.agentId,
      tenantId: input.scope.tenantId,
    },
    basePath: sandboxMount
      ? resolveLocalMountBasePath(
          input.scope.tenantId,
          sandboxMount.fileStorageRelativePath
        )
      : homeMount
        ? resolveLocalMountBasePath(
            input.scope.tenantId,
            homeMount.fileStorageRelativePath
          )
        : resolveTenantLocalWorkspaceBasePath(input.scope.tenantId),
    bm25: input.bm25,
    enableSandbox: input.enableSandbox ?? false,
    enableSkillSearch: input.enableSkillSearch ?? false,
    enableVector: input.enableVector ?? false,
    searchIndexName: tenantSearchIndexName(input.scope.tenantId),
    // Agents use named mounts only; never add Mastra's implicit `/` root.
    omitRootMount: true,
    sandboxConfig: input.sandboxConfig,
    sandboxIdentity: input.sandboxIdentity,
    sandboxRequireApproval: input.sandboxRequireApproval ?? true,
    ...(input.skillDiscoveryPaths
      ? { skillDiscoveryPaths: input.skillDiscoveryPaths }
      : {}),
    // Bearer-backed file storage adapter — when missing the loader falls back
    // to LocalFilesystem so dev/tests still work without a core token.
    ...(coreBaseUrl && userAccessToken
      ? {
          fileStorageAccess: {
            coreBaseUrl,
            userAccessToken,
          },
        }
      : {}),
    mounts: input.mounts,
    workspaceFsMode: resolveEngentyWorkspaceFsMode(),
  };
}
