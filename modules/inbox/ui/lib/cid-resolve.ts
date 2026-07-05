// Lifted from the legacy inbox module — Content-ID normalizers for matching
// inline `cid:` image references to attachment metadata.

/** Normalize Content-ID header for lookup (matches cid: in HTML). */
export function cidLookupKeyFromContentId(
  header: string | null | undefined
): string | null {
  if (!header) {
    return null;
  }
  const t = header.replace(/^<|>$/g, "").trim().toLowerCase();
  const local = t.split("@")[0];
  return (local || t).trim();
}

/** Token after `cid:` in src attribute. */
export function cidLookupKeyFromSrcToken(token: string): string {
  const t = token
    .replace(/^cid:/i, "")
    .replace(/^['"]|['"]$/g, "")
    .trim()
    .toLowerCase();
  const local = t.split("@")[0];
  return (local || t).trim();
}
