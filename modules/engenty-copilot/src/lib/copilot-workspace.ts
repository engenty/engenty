// User-scoped paths and Mastra mount specs for the personal `engenty.copilot` workspace.
// One desk per user x tenant — sessions stay transcript-only, no per-session FS.
// See modules/engenty-copilot/dev/copilot-personal-workspace.md.

import {
  fileStorageTenantObjectKey,
  pathSegmentsAfterFileStorageTenantRoot,
} from "@engenty/file-storage";

export const COPILOT_AGENT_TYPE_KEY = "engenty.copilot";

// Session-list grouping label only — distinct from `task:<identifier>`.
// Not used as a storage path segment.
const COPILOT_USER_WORKSPACE_KEY_PREFIX = "agent:engenty.copilot:user:";

export interface CopilotWorkspaceMountSpec {
  fileStorageRelativePath: string;
  mountPath: string;
  readOnly?: boolean;
}

export function copilotUserWorkspaceKey(userId: string): string {
  const trimmed = userId.trim();
  if (!trimmed) {
    throw new Error("copilot_user_id_invalid");
  }
  return `${COPILOT_USER_WORKSPACE_KEY_PREFIX}${trimmed}`;
}

// Full tenant object key, e.g. `tenants/<tid>/ai/workspace/agents/engenty.copilot/users/<uid>`.
// Mirrors task workspace shape under `tasks/<identifier>` but keyed by user.
export function copilotUserWorkspaceStoragePrefix(
  tenantId: string,
  userId: string
): string {
  const trimmed = userId.trim();
  if (!trimmed) {
    throw new Error("copilot_user_id_invalid");
  }
  return fileStorageTenantObjectKey(
    tenantId,
    "ai",
    "workspace",
    "agents",
    COPILOT_AGENT_TYPE_KEY,
    "users",
    trimmed
  );
}

// Tenant-relative form (no `tenants/<tid>/` prefix) for Mastra mount specs.
export function copilotUserWorkspaceStorageRelativePath(
  userId: string
): string {
  const trimmed = userId.trim();
  if (!trimmed) {
    throw new Error("copilot_user_id_invalid");
  }
  return `ai/workspace/agents/${COPILOT_AGENT_TYPE_KEY}/users/${trimmed}/`;
}

// Writable personal desk — the only mount the copilot may modify by default.
export function buildCopilotUserHomeMount(
  userId: string
): CopilotWorkspaceMountSpec {
  return {
    fileStorageRelativePath: copilotUserWorkspaceStorageRelativePath(userId),
    mountPath: "/home",
  };
}

// Read-only tenant org skills (`tenants/.../ai/skills/`); shared library, not personal.
export function buildTenantSkillsMount(): CopilotWorkspaceMountSpec {
  return {
    fileStorageRelativePath: "ai/skills/",
    mountPath: "/tenant-skills",
    readOnly: true,
  };
}

export function copilotUserWorkspaceTenantRelativeDisplayPath(
  tenantId: string,
  userId: string
): string {
  const prefix = copilotUserWorkspaceStoragePrefix(tenantId, userId);
  const segments = pathSegmentsAfterFileStorageTenantRoot(prefix);
  return `${segments.join("/")}/`;
}
