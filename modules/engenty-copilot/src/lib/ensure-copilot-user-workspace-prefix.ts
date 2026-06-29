// Idempotent `.keep` bootstrap so Files UI can list the empty desk before the
// agent writes anything. Same policy as the task workspace prefix bootstrap.

import {
  type FileStorageService,
  fileStorageTenantObjectKey,
} from "@engenty/file-storage";
import type { StorageService } from "@engenty/plugin-sdk";
import {
  COPILOT_AGENT_TYPE_KEY,
  copilotUserWorkspaceStoragePrefix,
} from "./copilot-workspace.js";

export const COPILOT_USER_WORKSPACE_KEEP_FILENAME = ".keep";

export function copilotUserWorkspaceKeepObjectKey(
  tenantId: string,
  userId: string
): string {
  const trimmed = userId.trim();
  return fileStorageTenantObjectKey(
    tenantId,
    "ai",
    "workspace",
    "agents",
    COPILOT_AGENT_TYPE_KEY,
    "users",
    trimmed,
    COPILOT_USER_WORKSPACE_KEEP_FILENAME
  );
}

type EnsureCopilotUserWorkspaceStorage = Pick<
  FileStorageService | StorageService,
  "exists" | "upload"
>;

// Returns the tenant prefix; uploads a zero-byte `.keep` only when missing so
// repeated runs do not race or wipe agent-written objects.
export async function ensureCopilotUserWorkspacePrefix(
  storage: EnsureCopilotUserWorkspaceStorage,
  tenantId: string,
  userId: string
): Promise<string> {
  const prefix = copilotUserWorkspaceStoragePrefix(tenantId, userId);
  const keepKey = copilotUserWorkspaceKeepObjectKey(tenantId, userId);

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
