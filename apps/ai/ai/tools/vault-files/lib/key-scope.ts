import { FILE_STORAGE_ROOT_SEGMENT } from "@engenty/file-storage";

export function resolveVaultTenantPrefix(tenantId: string): string {
  return `${FILE_STORAGE_ROOT_SEGMENT}/${tenantId}`;
}

export function resolveScopedVaultKey(tenantId: string, key: string): string {
  const normalized = key.replace(/^\/+/, "").trim();
  if (!normalized || normalized.includes("..")) {
    throw new Error("vault_key_invalid");
  }
  const tenantPrefix = resolveVaultTenantPrefix(tenantId);
  if (
    normalized === tenantPrefix ||
    normalized.startsWith(`${tenantPrefix}/`)
  ) {
    return normalized;
  }
  return `${tenantPrefix}/${normalized}`.replace(/\/+/g, "/");
}
