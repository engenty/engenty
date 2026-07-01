/** Safe external href for inbox `source_url` (http/https only). */
export function inboxSafeSourceHref(url: string | null): string | null {
  if (!url?.trim()) {
    return null;
  }
  try {
    const u = new URL(url.trim());
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.href;
    }
  } catch {
    /* invalid */
  }
  return null;
}

/** Short label for table cells (host + truncated path). */
export function inboxSourceUrlLabel(url: string, maxLen = 48): string {
  try {
    const u = new URL(url);
    const host = u.host;
    const path = u.pathname + u.search;
    const rest = path.length > 1 ? path : "";
    const s = `${host}${rest}`;
    if (s.length <= maxLen) {
      return s;
    }
    return `${s.slice(0, maxLen - 1)}…`;
  } catch {
    return url.length > maxLen ? `${url.slice(0, maxLen - 1)}…` : url;
  }
}
