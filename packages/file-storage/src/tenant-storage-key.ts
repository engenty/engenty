import { FILE_STORAGE_ROOT_SEGMENT } from "./internal-storage-path.js";

export class FileStorageTenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStorageTenantScopeError";
  }
}

/** Reject keys outside `tenants/<tenant-id>/…` for mutating vault operations. */
export function assertTenantScopedStorageKey(
  key: string,
  tenantId: string | null | undefined
): void {
  const normalizedKey = key.replace(/^\/+/, "");
  if (normalizedKey.includes("..")) {
    throw new FileStorageTenantScopeError("storage_key_invalid");
  }
  if (!tenantId) {
    throw new FileStorageTenantScopeError("tenant_id_required");
  }
  const expectedPrefix = `${FILE_STORAGE_ROOT_SEGMENT}/${tenantId}/`;
  if (!normalizedKey.startsWith(expectedPrefix)) {
    throw new FileStorageTenantScopeError("storage_key_outside_tenant_scope");
  }
}
