import {
  type FileStorageService,
  fileStorageSpaceObjectKey,
} from "@engenty/file-storage";
import type { StorageService } from "@engenty/plugin-sdk";
import { taskWorkspaceStoragePrefix } from "./task-workspace.js";

export const TASK_WORKSPACE_KEEP_FILENAME = ".keep";

/**
 * Bootstrap policy: write an idempotent empty `.keep` marker at first checkout.
 * Chosen over lazy-create-on-write so `/mdl/files?prefix=…` can list the folder
 * before the agent writes artefacts.
 */
export function taskWorkspaceKeepObjectKey(
  tenantId: string,
  spaceId: string,
  identifier: string
): string {
  return fileStorageSpaceObjectKey(
    tenantId,
    spaceId,
    "ai",
    "workspace",
    "tasks",
    identifier.trim(),
    TASK_WORKSPACE_KEEP_FILENAME
  );
}

type EnsureTaskWorkspaceStorage = Pick<
  FileStorageService | StorageService,
  "exists" | "upload"
>;

export async function ensureTaskWorkspacePrefix(
  storage: EnsureTaskWorkspaceStorage,
  tenantId: string,
  spaceId: string,
  identifier: string
): Promise<string> {
  const prefix = taskWorkspaceStoragePrefix(tenantId, spaceId, identifier);
  const keepKey = taskWorkspaceKeepObjectKey(tenantId, spaceId, identifier);

  if (storage.exists) {
    const alreadyExists = await storage.exists(keepKey);
    if (alreadyExists) {
      return prefix;
    }
  }

  await storage.upload(keepKey, new Uint8Array(0), {
    contentType: "application/octet-stream",
    upsert: false,
  });

  return prefix;
}
