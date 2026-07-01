import {
  isKbScopedReservedArticleId,
  kbArticlesListPath,
  kbFaqsListPath,
  kbHubPath,
} from "../kb-paths.js";

function kbScopedPrefix(slug: string): string {
  return `/mdl/knowledge-base/${encodeURIComponent(slug)}`;
}

/** KB hub / start (`/kb/:slug`, `/kb/:slug/chat`). */
export function isKbHubStartPath(pathname: string, slug: string): boolean {
  const base = kbHubPath(slug);
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return (
    pathOnly === base ||
    pathOnly === `${base}/` ||
    pathOnly === `${base}/chat` ||
    pathOnly === `${base}/chat/`
  );
}

export function isKbArticlesListNavPath(
  pathname: string,
  slug: string
): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return pathOnly === kbArticlesListPath(slug);
}

export function isKbFaqsListNavPath(pathname: string, slug: string): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return pathOnly === kbFaqsListPath(slug);
}

/** Favorites list — drives the Favorites sidebar tab. */
export function isKbSidebarFavoritesRoute(
  pathname: string,
  slug: string
): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const base = `${kbScopedPrefix(slug)}/favorites`;
  return pathOnly === base || pathOnly.startsWith(`${base}/`);
}

/** FAQ list, detail, or edit — drives the FAQs sidebar tab. */
export function isKbSidebarFaqRoute(pathname: string, slug: string): boolean {
  const prefix = `${kbScopedPrefix(slug)}/faqs`;
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return pathOnly === prefix || pathOnly.startsWith(`${prefix}/`);
}

/** Article tree routes — drives the Articles sidebar tab. */
export function isKbSidebarArticleRoute(
  pathname: string,
  slug: string
): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const base = kbScopedPrefix(slug);

  if (pathOnly === kbArticlesListPath(slug)) {
    return true;
  }
  if (pathOnly.startsWith(`${base}/c/`)) {
    return true;
  }

  const match = pathOnly.match(
    new RegExp(
      `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/]+)(?:/edit)?$`
    )
  );
  const segment = match?.[1];
  if (!segment || isKbScopedReservedArticleId(segment)) {
    return false;
  }
  return true;
}
