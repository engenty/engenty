/**
 * Tenant-scoped bucket registry for the admin file explorer.
 *
 * Only buckets with a *verified* tenant-scoped key layout are browsable here.
 * Every storage key in these buckets begins with the tenant id, in one of two
 * conventions:
 *   - the shared `files` bucket:        `tenants/<tenantId>/…`
 *   - per-module buckets (invoices…):   `<tenantId>/…`
 *
 * The explorer derives the tenant id from auth and clamps every requested
 * prefix/key to that tenant's root, so the browser can navigate within a
 * tenant's subtree but never escape it.
 */

export class TenantScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeViolationError";
  }
}

export interface TenantBucket {
  /** Marks the bucket selected by default in the explorer. */
  default?: boolean;
  id: string;
  /** Absolute storage prefix that roots this tenant's content (ends with `/`). */
  tenantRoot: (tenantId: string) => string;
}

export const FILE_EXPLORER_DEFAULT_BUCKET = "files";

/** Buckets whose tenant layout is confirmed in code (per-module DAL writers). */
export const FILE_EXPLORER_BUCKETS: readonly TenantBucket[] = [
  { id: "files", tenantRoot: (t) => `tenants/${t}/`, default: true },
  { id: "module-invoices-pdfs", tenantRoot: (t) => `${t}/` },
  { id: "module-team-contracts", tenantRoot: (t) => `${t}/` },
  { id: "module-leads-documents", tenantRoot: (t) => `${t}/` },
  { id: "kb-sync", tenantRoot: (t) => `${t}/` },
];

export function findTenantBucket(
  id: string | undefined
): TenantBucket | undefined {
  const bucketId = id || FILE_EXPLORER_DEFAULT_BUCKET;
  return FILE_EXPLORER_BUCKETS.find((b) => b.id === bucketId);
}

function normalizeKey(value: string): string {
  return value.replace(/^\/+/, "");
}

/**
 * Resolve a client-supplied (possibly relative) prefix to an absolute storage
 * prefix under the tenant root. Empty → the tenant root itself. A prefix that
 * is already absolute under the root is kept; otherwise it is treated as
 * relative to the root. Throws on path traversal or an out-of-scope absolute
 * prefix.
 */
export function resolveTenantPrefix(
  bucket: TenantBucket,
  tenantId: string,
  requestedPrefix: string | undefined
): string {
  const root = bucket.tenantRoot(tenantId);
  const raw = normalizeKey(requestedPrefix ?? "");
  if (raw.includes("..")) {
    throw new TenantScopeViolationError("prefix_invalid");
  }
  if (raw === "") {
    return root;
  }
  const absolute = raw.startsWith(root) ? raw : `${root}${raw}`;
  if (!absolute.startsWith(root)) {
    throw new TenantScopeViolationError("prefix_outside_tenant_scope");
  }
  return absolute;
}

/** The portion of an absolute key/prefix below the tenant root (for the UI). */
export function relativeToTenantRoot(
  bucket: TenantBucket,
  tenantId: string,
  absolute: string
): string {
  const root = bucket.tenantRoot(tenantId);
  const normalized = normalizeKey(absolute);
  return normalized.startsWith(root)
    ? normalized.slice(root.length)
    : normalized;
}

/** Assert a single object key lives under the tenant root (url/delete/preview). */
export function assertKeyInTenant(
  bucket: TenantBucket,
  tenantId: string,
  key: string
): void {
  const root = bucket.tenantRoot(tenantId);
  const normalized = normalizeKey(key);
  if (normalized.includes("..") || !normalized.startsWith(root)) {
    throw new TenantScopeViolationError("key_outside_tenant_scope");
  }
}
