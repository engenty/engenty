/**
 * Collects KB article IDs referenced by TipTap link marks inside `content_json`.
 * Matches `/mdl/knowledge-base/kb/:slug/:articleId` (and absolute URLs with that path).
 */

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const KB_ARTICLE_PATH_RE = new RegExp(
  `/mdl/knowledge-base/kb/[^/]+/(${UUID})(?:/|$)`,
  "gi"
);

/** Returns distinct article IDs found in `href` (internal KB article URLs only). */
export function parseKbArticleIdsFromHref(href: string): string[] {
  const raw = href.trim();
  if (!raw) {
    return [];
  }
  let path = raw;
  try {
    if (raw.includes("://")) {
      path = new URL(raw).pathname;
    }
  } catch {
    return [];
  }
  const out: string[] = [];
  KB_ARTICLE_PATH_RE.lastIndex = 0;
  for (
    let m = KB_ARTICLE_PATH_RE.exec(path);
    m !== null;
    m = KB_ARTICLE_PATH_RE.exec(path)
  ) {
    out.push(m[1].toLowerCase());
  }
  return out;
}

function walkTipTapJson(node: unknown, hrefs: Set<string>): void {
  if (node === null || node === undefined) {
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) {
      walkTipTapJson(x, hrefs);
    }
    return;
  }
  if (typeof node !== "object") {
    return;
  }
  const o = node as Record<string, unknown>;
  const marks = Array.isArray(o.marks) ? o.marks : [];
  for (const mark of marks) {
    if (mark && typeof mark === "object") {
      const m = mark as { type?: unknown; attrs?: { href?: unknown } };
      if (m.type === "link" && typeof m.attrs?.href === "string") {
        hrefs.add(m.attrs.href);
      }
    }
  }
  for (const v of Object.values(o)) {
    walkTipTapJson(v, hrefs);
  }
}

/** All KB article IDs linked from TipTap `content_json` (same KB paths only). */
export function extractKbArticleIdsFromContentJson(
  contentJson: unknown
): Set<string> {
  const hrefs = new Set<string>();
  walkTipTapJson(contentJson, hrefs);
  const ids = new Set<string>();
  for (const h of hrefs) {
    for (const id of parseKbArticleIdsFromHref(h)) {
      ids.add(id);
    }
  }
  return ids;
}
