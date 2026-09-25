// Builds the Mastra workspace runtime spec for a run from explicit capability
// flags (no agent-type branching). Callers expand an `AgentConfig.workspace`
// declaration into a mount table + flags and pass them here.
//
// Agents use named mounts only. Depending on preset and bindings, a run may
// receive `/home`, `/space`, the read-only `/company`, `/skills`, `/task`,
// `/routine`, `/project`, `/data`, and `/sandbox`. There is no `/` root
// mount and no unscoped-filesystem shape: an agent sees exactly what its
// resolved mount table grants. Sandbox staging paths are derived per mount by
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
  /**
   * Skill directory names visible on `/skills` for this run.
   *
   * Omit (`undefined`) for an intentional tenant-global run — no filter.
   * Pass `[]` when a claimed Space failed to resolve (fail closed).
   * Never treat unresolved as omitted.
   */
  allowedSkillNames?: string[];
  bm25?: boolean;
  /** `core.agents` uuid for `agentId`; forwarded by the `/data` mount. */
  coreAgentId?: string;
  /** Mastra workspace tools to leave off, by `mastra_workspace_*` name. */
  disabledWorkspaceTools?: string[];
  enableSandbox?: boolean;
  enableSkillSearch?: boolean;
  enableVector?: boolean;
  mounts: EngentyWorkspaceMountSpec[];
  sandboxConfig?: {
    lifecycle?: "run" | "session" | "task" | "space";
    mountPath?: string;
    network?: "none" | "egress";
    provider?: "docker" | "local";
    timeoutMs?: number;
  };
  sandboxIdentity?: {
    runId: string;
    spaceId?: string;
    taskIdentifier?: string;
    tenantId: string;
    threadId: string;
  };
  sandboxRequireApproval?: boolean;
  scope: AiSessionScope;
  skillDiscoveryPaths?: string[];
  /** A Space computer's own egress hosts. */
  spaceComputerEgressHosts?: readonly string[];
  /** A Space computer's reach, from the Space (not the agent). */
  spaceComputerNetwork?: "none" | "egress";
}) {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const accessToken = scopeAccessToken(input.scope)?.trim();

  return {
    agentConfig: {
      id: input.agentId,
      instructions: "",
      name: input.agentId,
      tenantId: input.scope.tenantId,
    },
    ...(input.allowedSkillNames === undefined
      ? {}
      : { allowedSkillNames: input.allowedSkillNames }),
    bm25: input.bm25,
    ...(input.coreAgentId ? { coreAgentId: input.coreAgentId } : {}),
    disabledWorkspaceTools: input.disabledWorkspaceTools ?? [],
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
    ...(input.spaceComputerNetwork
      ? { spaceComputerNetwork: input.spaceComputerNetwork }
      : {}),
    ...(input.spaceComputerEgressHosts
      ? { spaceComputerEgressHosts: [...input.spaceComputerEgressHosts] }
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
