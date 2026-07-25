// Expands a declarative `AgentConfig.workspace` (from @engenty/ai-core) into a
// concrete, tenant-scoped Mastra mount table.
//
// Two archetype presets:
//   assistant — per-user personal desk (engenty.copilot): `/home` user-scoped
//               (rw), `/shared` tenant-shared (rw), `/skills` (ro), `/task`
//               when bound.
//   code_execution — sandbox-first: `/shared` tenant-shared (rw), `/skills`
//                    (ro), `/sandbox` (rw), optional `/task` when bound.
//
// `/shared` (source `commons`) is the writable, durable tenant-shared scratch
// space — the cross-user/cross-session space agents persist artifacts to. There
// is no read-only `/` tenant asset mount; the seeded AGENTS.md/SOUL.md reach the
// agent via prompt injection (the instruction registry), not a filesystem mount.
//
// `scope` resolves to a tenant-relative file-storage prefix (no `tenants/<tid>/`
// prefix — the FileStorageFilesystem adds that). `group` is reserved for a future
// tenant-group concept and is intentionally unhandled here.

import type {
  AgentWorkspaceConfig,
  AgentWorkspaceMount,
} from "@engenty/ai-core";
import {
  COMMONS_STORAGE_PREFIX,
  workWorkspaceRelativePrefix,
} from "@engenty/file-storage";

import type { EngentyWorkspaceMountSpec } from "./contracts.js";

// Writable, durable tenant-shared scratch space (cross-user/session). When a
// sandbox is enabled this prefix is staged locally and bind-mounted into the
// sandbox so running code can read/write it (see loader + docker provider).
// Re-exported from @engenty/file-storage so bytes stay where they are.
export { COMMONS_STORAGE_PREFIX } from "@engenty/file-storage";

// Agent/user-scoped durable home. Shares the same staged+bind-mounted+synced
// mechanism as commons when a sandbox is enabled (its storage prefix is per-user
// or per-agent — see `resolveScopeRelativePath`).
export const HOME_MOUNT_PATH = "/home";

export interface WorkspaceScopeContext {
  agentId: string;
  runId?: string;
  sandboxLifecycle?: "run" | "session" | "task";
  taskIdentifier?: string;
  tenantId: string;
  threadId?: string;
  userId: string;
}

// Preset mount tables. Order matters for skill discovery readability only.
const ASSISTANT_MOUNTS: AgentWorkspaceMount[] = [
  { access: "rw", path: HOME_MOUNT_PATH, scope: "user", source: "home" },
  { access: "rw", path: "/shared", scope: "tenant", source: "commons" },
  { access: "ro", path: "/skills", scope: "tenant", source: "skills" },
  {
    access: "rw",
    path: "/task",
    requireBinding: true,
    scope: "task",
    source: "checkout",
  },
];

const STAFF_MOUNTS: AgentWorkspaceMount[] = [
  // Staff agents are company resources: `/home` is agent-scoped scratch.
  { access: "rw", path: HOME_MOUNT_PATH, scope: "agent", source: "home" },
  { access: "rw", path: "/shared", scope: "tenant", source: "commons" },
  { access: "ro", path: "/skills", scope: "tenant", source: "skills" },
  {
    access: "rw",
    path: "/task",
    requireBinding: true,
    scope: "task",
    source: "checkout",
  },
];

const CODE_EXECUTION_MOUNTS: AgentWorkspaceMount[] = [
  { access: "rw", path: "/shared", scope: "tenant", source: "commons" },
  { access: "ro", path: "/skills", scope: "tenant", source: "skills" },
  { access: "rw", path: "/sandbox", scope: "sandbox", source: "sandbox" },
  {
    access: "rw",
    path: "/task",
    requireBinding: true,
    scope: "task",
    source: "checkout",
  },
];

// Explicit `mounts` win; otherwise expand the named preset. `custom` with no
// mounts yields an empty table (caller decides what that means).
export function expandWorkspaceMounts(
  config: AgentWorkspaceConfig
): AgentWorkspaceMount[] {
  if (config.mounts && config.mounts.length > 0) {
    return config.mounts;
  }
  switch (config.preset) {
    case "assistant":
      return ASSISTANT_MOUNTS;
    case "staff":
      return STAFF_MOUNTS;
    case "code_execution":
      return CODE_EXECUTION_MOUNTS;
    default:
      return [];
  }
}

export interface SandboxLifecycleContext {
  runId: string;
  taskIdentifier?: string;
  threadId: string;
}

export function resolveSandboxStorageRelativePath(
  lifecycle: "run" | "session" | "task",
  ctx: SandboxLifecycleContext
): string {
  if (lifecycle === "task") {
    const identifier = ctx.taskIdentifier?.trim();
    if (!identifier) {
      throw new Error("sandbox_task_lifecycle_requires_task_binding");
    }
    return workWorkspaceRelativePrefix("task", identifier);
  }
  const sandboxId =
    lifecycle === "session" ? `session-${ctx.threadId}` : `run-${ctx.runId}`;
  return `ai/sandboxes/${sandboxId}/workspace/`;
}

// (source, scope) -> tenant-relative storage prefix. Single switch point so a
// future `group` scope is a one-line addition (see plan "Group readiness").
export function resolveScopeRelativePath(
  mount: AgentWorkspaceMount,
  ctx: WorkspaceScopeContext
): string | null {
  switch (mount.source) {
    case "sandbox": {
      if (!(ctx.runId && ctx.threadId)) {
        return null;
      }
      const lifecycle = ctx.sandboxLifecycle ?? "run";
      if (lifecycle === "task") {
        const identifier = ctx.taskIdentifier?.trim();
        if (!identifier) {
          return null;
        }
      }
      return resolveSandboxStorageRelativePath(lifecycle, {
        runId: ctx.runId,
        threadId: ctx.threadId,
        ...(ctx.taskIdentifier ? { taskIdentifier: ctx.taskIdentifier } : {}),
      });
    }
    case "commons":
      // Writable tenant-shared scratch space (durable, cross-user/session).
      return COMMONS_STORAGE_PREFIX;
    case "skills":
      return "ai/skills/";
    case "home":
      if (mount.scope === "agent") {
        return `ai/workspace/agents/${ctx.agentId}/`;
      }
      // default: per-user home (cross-agent)
      return `ai/workspace/users/${ctx.userId}/`;
    case "checkout": {
      const identifier = ctx.taskIdentifier?.trim();
      if (!identifier) {
        return null;
      }
      return workWorkspaceRelativePrefix("task", identifier);
    }
    default:
      return null;
  }
}

// Resolve the declared mount table into Mastra mount specs for the current run.
// Mounts whose `requireBinding` entity is missing (e.g. `/task` with no task)
// are dropped rather than mounted empty.
export function buildEngentyMountSpecs(
  mounts: AgentWorkspaceMount[],
  ctx: WorkspaceScopeContext
): EngentyWorkspaceMountSpec[] {
  const specs: EngentyWorkspaceMountSpec[] = [];
  for (const mount of mounts) {
    const fileStorageRelativePath = resolveScopeRelativePath(mount, ctx);
    if (!fileStorageRelativePath) {
      // Unresolved binding (or unsupported scope like `group`): skip.
      continue;
    }
    specs.push({
      fileStorageRelativePath,
      mountPath: mount.path,
      readOnly: mount.access === "ro",
    });
  }
  return specs;
}

// The default skill discovery paths inside the workspace. The `/skills` mount
// maps to `ai/skills/` in file storage and splits into two tiers: `managed`
// (read-only, code-provided) and `custom` (editable, uploaded/installed). Both
// are discovered so agents see every available skill.
export const DEFAULT_SKILL_DISCOVERY_PATHS = [
  "/skills/managed",
  "/skills/custom",
];
