// Resolve an agent's declarative `workspace` config into a display-oriented view
// the admin UI can render WITHOUT starting a run. Run-bound mounts (`/task`,
// `/project`, `/sandbox`) have no binding in an admin scope, so they
// resolve to `available: false` rather than being dropped — the UI still shows
// the full mount topology, just marked unavailable.

import type { AgentConfig, AgentWorkspaceMount } from "@engenty/ai-core";

import {
  expandWorkspaceMounts,
  resolveScopeRelativePath,
  type WorkspaceScopeContext,
} from "./workspace-presets.js";

export interface WorkspaceAdminScope {
  agentId: string;
  tenantId: string;
  userId: string;
}

export interface WorkspaceMountView {
  access: "ro" | "rw";
  /** Resolvable in an admin (no-run) scope. */
  available: boolean;
  /** Safe to browse files for: available with a concrete storage prefix. */
  browsable: boolean;
  /** Mount point inside the workspace, e.g. `/home`. */
  path: string;
  /** Needs a run-time binding (task/sandbox) we don't have in admin scope. */
  requiresBinding: boolean;
  /** Scope archetype, e.g. `user` | `agent` | `tenant` | `task`. */
  scope: string;
  /** Storage source archetype, e.g. `home` | `commons` | `skills`. */
  source: string;
  /** Tenant-relative file-storage prefix; null when not resolvable here. */
  storagePrefix: string | null;
}

export interface AgentWorkspaceView {
  /** Whether workspace settings are editable (tenant-created db agents only). */
  configurable: boolean;
  enabled: boolean;
  mounts: WorkspaceMountView[];
  preset: string;
  sandbox?: Record<string, unknown>;
  search?: { bm25?: boolean; vector?: boolean };
  skills?: { discoveryPaths?: string[] };
}

function toMountView(
  mount: AgentWorkspaceMount,
  ctx: WorkspaceScopeContext
): WorkspaceMountView {
  const storagePrefix = resolveScopeRelativePath(mount, ctx);
  const available = storagePrefix !== null;
  return {
    path: mount.path,
    source: mount.source,
    scope: mount.scope,
    access: mount.access,
    storagePrefix,
    available,
    requiresBinding: mount.requireBinding === true,
    browsable: available,
  };
}

/**
 * Build the admin workspace view for an agent. Returns null when the agent has
 * no workspace configured at all.
 */
export function resolveAgentWorkspaceView(
  config: Pick<AgentConfig, "workspace" | "source">,
  scope: WorkspaceAdminScope
): AgentWorkspaceView | null {
  const ws = config.workspace;
  if (!ws) {
    return null;
  }
  const ctx: WorkspaceScopeContext = {
    agentId: scope.agentId,
    tenantId: scope.tenantId,
    userId: scope.userId,
  };
  const mounts = expandWorkspaceMounts(ws).map((mount) =>
    toMountView(mount, ctx)
  );
  return {
    enabled: ws.enabled !== false,
    preset: ws.preset,
    ...(ws.search ? { search: ws.search } : {}),
    ...(ws.skills ? { skills: ws.skills } : {}),
    ...(ws.sandbox ? { sandbox: ws.sandbox as Record<string, unknown> } : {}),
    mounts,
    configurable: config.source === "database",
  };
}

/** Find a mount by its mount path within a resolved view. */
export function findMountView(
  view: AgentWorkspaceView,
  mountPath: string
): WorkspaceMountView | undefined {
  return view.mounts.find((mount) => mount.path === mountPath);
}
