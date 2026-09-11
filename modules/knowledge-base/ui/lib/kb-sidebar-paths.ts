import {
  isKbScopedReservedArticleId,
  KB_MODULE_BASE,
  kbArticlesListPath,
  kbFaqsListPath,
  kbHubPath,
} from "../kb-paths.js";

function pathOnlyOf(pathname: string): string {
  return pathname.split("?")[0]?.split("#")[0] ?? pathname;
}

/** KB hub / start (`/mdl/knowledge-base`, `/mdl/knowledge-base/chat`). */
export function isKbHubStartPath(pathname: string): boolean {
  const base = kbHubPath();
  const pathOnly = pathOnlyOf(pathname);
  return (
    pathOnly === base ||
    pathOnly === `${base}/` ||
    pathOnly === `${base}/chat` ||
    pathOnly === `${base}/chat/`
  );
}

export function isKbArticlesListNavPath(pathname: string): boolean {
  return pathOnlyOf(pathname) === kbArticlesListPath();
}

export function isKbFaqsListNavPath(pathname: string): boolean {
  return pathOnlyOf(pathname) === kbFaqsListPath();
}

/** Favorites list — drives the Favorites sidebar tab. */
export function isKbSidebarFavoritesRoute(pathname: string): boolean {
  const pathOnly = pathOnlyOf(pathname);
  const base = `${KB_MODULE_BASE}/favorites`;
  return pathOnly === base || pathOnly.startsWith(`${base}/`);
}

/** Source list/detail/edit/setup + source-item detail — drives the Sources sidebar tab. */
export function isKbSidebarSourcesRoute(pathname: string): boolean {
  const pathOnly = pathOnlyOf(pathname);
  const sources = `${KB_MODULE_BASE}/sources`;
  const items = `${KB_MODULE_BASE}/source-items`;
  return (
    pathOnly === sources ||
    pathOnly.startsWith(`${sources}/`) ||
    pathOnly === items ||
    pathOnly.startsWith(`${items}/`)
  );
}

/** FAQ list, detail, or edit — drives the FAQs sidebar tab. */
export function isKbSidebarFaqRoute(pathname: string): boolean {
  const prefix = `${KB_MODULE_BASE}/faqs`;
  const pathOnly = pathOnlyOf(pathname);
  return pathOnly === prefix || pathOnly.startsWith(`${prefix}/`);
}

/** Article tree routes — drives the Articles sidebar tab. */
export function isKbSidebarArticleRoute(pathname: string): boolean {
  const pathOnly = pathOnlyOf(pathname);
  if (pathOnly === kbArticlesListPath()) {
    return true;
  }
  if (pathOnly === `${KB_MODULE_BASE}/browse`) {
    return true;
  }
  if (pathOnly.startsWith(`${KB_MODULE_BASE}/c/`)) {
    return true;
  }
  const rest = pathOnly.startsWith(`${KB_MODULE_BASE}/`)
    ? pathOnly.slice(KB_MODULE_BASE.length + 1)
    : "";
  if (!rest) {
    return false;
  }
  const first = rest.split("/")[0] ?? "";
  // `/mdl/knowledge-base/<articleIdOrSlug>[/edit]` — anything not reserved.
  return !isKbScopedReservedArticleId(first);
}
