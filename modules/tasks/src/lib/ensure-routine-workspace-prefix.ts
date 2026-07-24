import {
  type FileStorageService,
  fileStorageTenantObjectKey,
} from "@engenty/file-storage";
import type { StorageService } from "@engenty/plugin-sdk";
import { routineWorkspaceStoragePrefix } from "./routine-workspace.js";

export const ROUTINE_WORKSPACE_KEEP_FILENAME = ".keep";

export function routineWorkspaceKeepObjectKey(
  tenantId: string,
  triggerId: string
): string {
  return fileStorageTenantObjectKey(
    tenantId,
    "ai",
    "workspace",
    "routines",
    triggerId.trim(),
    ROUTINE_WORKSPACE_KEEP_FILENAME
  );
}

type EnsureStorage = Pick<
  FileStorageService | StorageService,
  "exists" | "upload"
>;

/** Idempotent `.keep` bootstrap for a routine workspace prefix. Fail-open at call site. */
export async function ensureRoutineWorkspacePrefix(
  storage: EnsureStorage,
  tenantId: string,
  triggerId: string
): Promise<string> {
  const prefix = routineWorkspaceStoragePrefix(tenantId, triggerId);
  const keepKey = routineWorkspaceKeepObjectKey(tenantId, triggerId);

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
