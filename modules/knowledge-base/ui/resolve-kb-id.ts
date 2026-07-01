/**
 * Resolve the active knowledge base id from the URL and loaded KB list.
 * Tenant default is `KbSettings.default_kb_id` only (see module settings).
 */

export function tenantDefaultKbId(
  settings: { default_kb_id: string | null } | undefined
): string | null {
  const id = settings?.default_kb_id?.trim();
  return id ? id : null;
}

export function kbIdFromSlug(
  kbs: Array<{ id: string; slug: string }>,
  slug: string
): string {
  const decoded = decodeURIComponent(slug.trim());
  return kbs.find((k) => k.slug === decoded)?.id ?? "";
}

export function slugFromKbId(
  kbs: Array<{ id: string; slug: string }>,
  kbId: string
): string | undefined {
  return kbs.find((k) => k.id === kbId)?.slug;
}

export function resolveKbIdFromUrl(
  searchParams: URLSearchParams,
  kbs: Array<{ id: string }>,
  tenantDefaultKbId: string | null
): string {
  const raw = searchParams.get("kb_id")?.trim();
  if (
    raw &&
    raw.length > 0 &&
    raw !== "undefined" &&
    raw !== "null" &&
    kbs.some((k) => k.id === raw)
  ) {
    return raw;
  }
  const defaultId = tenantDefaultKbId?.trim();
  if (defaultId && kbs.some((k) => k.id === defaultId)) {
    return defaultId;
  }
  return "";
}
