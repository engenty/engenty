import {
  pathSegmentsAfterFileStorageContainerRoot,
  workWorkspacePrefix,
} from "@engenty/file-storage";
import { z } from "zod";
import { isValidTaskIdentifier } from "../domain/task-lifecycle.js";

const TASK_WORKSPACE_KEY_PREFIX = "task:";

// Accepts both the space-rooted layout and the pre-space tenant-rooted one:
// bytes written before PLAN-spaces.md Phase 6 re-roots them still have to parse.
const TASK_WORKSPACE_STORAGE_PREFIX_PATTERN =
  /^tenants\/[^/]+\/(?:spaces\/[^/]+\/)?ai\/workspace\/tasks\/([^/]+)(?:\/|$)/;
const TASK_WORKSPACE_STORAGE_PREFIX_RELATIVE_PATTERN =
  /^ai\/workspace\/tasks\/([^/]+)(?:\/|$)/;

export const taskWorkspaceKeySchema = z
  .string()
  .refine((value) => parseTaskWorkspaceKey(value) !== null, {
    message: "invalid_task_workspace_key",
  });

export function taskWorkspaceKey(identifier: string): string {
  const trimmed = identifier.trim();
  if (!isValidTaskIdentifier(trimmed)) {
    throw new Error("task_identifier_invalid");
  }
  return `${TASK_WORKSPACE_KEY_PREFIX}${trimmed}`;
}

export function taskWorkspaceStoragePrefix(
  tenantId: string,
  spaceId: string,
  identifier: string
): string {
  const trimmed = identifier.trim();
  if (!isValidTaskIdentifier(trimmed)) {
    throw new Error("task_identifier_invalid");
  }
  // Historical callers expect no trailing slash — strip the convention's slash.
  return workWorkspacePrefix(tenantId, spaceId, "task", trimmed).replace(
    /\/$/,
    ""
  );
}

export function parseTaskWorkspaceKey(
  workspaceKey: string
): { type: "task"; identifier: string } | null {
  if (!workspaceKey.startsWith(TASK_WORKSPACE_KEY_PREFIX)) {
    return null;
  }
  const identifier = workspaceKey.slice(TASK_WORKSPACE_KEY_PREFIX.length);
  if (!isValidTaskIdentifier(identifier)) {
    return null;
  }
  return { type: "task", identifier };
}

export function taskIdentifierFromStoragePrefix(prefix: string): string | null {
  const match =
    TASK_WORKSPACE_STORAGE_PREFIX_PATTERN.exec(prefix) ??
    TASK_WORKSPACE_STORAGE_PREFIX_RELATIVE_PATTERN.exec(prefix);
  const identifier = match?.[1];
  if (!(identifier && isValidTaskIdentifier(identifier))) {
    return null;
  }
  return identifier;
}

/**
 * Human-facing path for the task workspace — space-relative, so the space id
 * (a routing detail) never reaches a breadcrumb.
 */
export function taskWorkspaceDisplayPath(
  tenantId: string,
  spaceId: string,
  identifier: string
): string {
  const prefix = taskWorkspaceStoragePrefix(tenantId, spaceId, identifier);
  const segments = pathSegmentsAfterFileStorageContainerRoot(prefix);
  return `${segments.join("/")}/`;
}
