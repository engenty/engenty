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
      runId: identity.runId,
      taskIdentifier: identity.taskIdentifier,
      threadId: identity.threadId,
    }
  );
  const stagingPath = resolveLocalMountBasePath(
    identity.tenantId,
    fileStorageRelativePath
  );
  return { fileStorageRelativePath, stagingPath };
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
  if (identity.lifecycle === "task") {
    const identifier = identity.taskIdentifier?.trim();
    if (!identifier) {
      throw new Error("sandbox_task_lifecycle_requires_task_binding");
    }
    return `task-${identifier}`;
  }
  return identity.lifecycle === "session"
    ? `session-${identity.threadId}`
    : `run-${identity.runId}`;
}
