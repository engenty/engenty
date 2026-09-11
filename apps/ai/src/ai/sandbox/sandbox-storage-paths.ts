import path from "node:path";
import { resolveLocalMountBasePath } from "../workspace/local-workspace-paths.js";
import { resolveSandboxStorageRelativePath } from "../workspace/workspace-presets.js";
import type {
  SandboxRunIdentity,
  SandboxStorageLayout,
} from "./sandbox-types.js";

export function resolveSandboxStorageLayout(
  identity: SandboxRunIdentity
): SandboxStorageLayout {
  const fileStorageRelativePath = resolveSandboxStorageRelativePath(
    identity.lifecycle,
    {
      agentId: identity.agentId,
      runId: identity.runId,
      taskIdentifier: identity.taskIdentifier,
      threadId: identity.threadId,
    }
  );
  const stagingPath = resolveLocalMountBasePath(
    identity.tenantId,
    fileStorageRelativePath,
    identity.spaceId
  );
  return {
    fileStorageRelativePath,
    stagingPath,
    ...(identity.spaceId ? { spaceId: identity.spaceId } : {}),
  };
}

export function resolveSandboxMetaKey(fileStorageRelativePath: string): string {
  const normalized = fileStorageRelativePath.replace(/\/+$/, "");
  const parent = path.posix.dirname(normalized);
  return `${parent}/.meta.json`;
}

// Stable executor key for the lifecycle, mirroring the staging-dir keying in
// `resolveSandboxStorageRelativePath`. The sandbox container id MUST use this
// (not the raw run id) so a `session` sandbox maps to ONE container across the
// suspend -> approve -> resume round-trip (resume is a fresh run id).
export function resolveSandboxScopeKey(identity: SandboxRunIdentity): string {
  if (identity.lifecycle === "space") {
    // The space computer: ONE container per space, shared by every run that
    // targets it. The key carries no run, thread
    // or agent — that is the point. A space claim that did not resolve must
    // never fall back to a tenant-wide machine.
    const space = identity.spaceId?.trim();
    if (!space) {
      throw new Error("sandbox_space_lifecycle_requires_space_binding");
    }
    return `space-${identity.tenantId}-${space}`;
  }
  if (identity.lifecycle === "task") {
    const identifier = identity.taskIdentifier?.trim();
    if (!identifier) {
      throw new Error("sandbox_task_lifecycle_requires_task_binding");
    }
    // A task identifier is unique per (tenant, scope), NOT globally — two
    // tenants can hold the same one. Run and session keys carry globally
    // unique ids, so only this branch needs the tenant and space prefix.
    const space = identity.spaceId?.trim();
    return `task-${identity.tenantId}-${space ?? "tenant"}-${identifier}`;
  }
  // Session keys carry the agent as well as the thread: one conversation can
  // run several agents, and each needs its own container — see
  // `SandboxLifecycleContext.agentId`.
  return identity.lifecycle === "session"
    ? `session-${identity.threadId}-${identity.agentId}`
    : `run-${identity.runId}`;
}
