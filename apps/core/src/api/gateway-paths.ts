export type GatewayTarget = "ai" | "docs" | "manage" | "studio" | "ui";

/** Manage (`apps/manage`) when served under `/manage` on the gateway host. */
export function isManageGatewayPath(pathname: string): boolean {
  return pathname === "/manage" || pathname.startsWith("/manage/");
}

/**
 * Manage is a base-pathed SPA (base `/manage/`); a bare `/manage` has no valid
 * asset root. Returns the canonical trailing-slash location to redirect to
 * (preserving the query string), or null when no redirect is needed.
 */
export function manageCanonicalRedirect(
  pathname: string,
  search: string
): string | null {
  return pathname === "/manage" ? `/manage/${search}` : null;
}

/** Fumadocs (`apps/docs`) paths when served under `/docs` on the gateway host. */
export function isDocsGatewayPath(pathname: string): boolean {
  if (pathname === "/docs" || pathname.startsWith("/docs/")) {
    return true;
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/__nextjs")) {
    return true;
  }
  if (pathname === "/api/search" || pathname.startsWith("/api/search/")) {
    return true;
  }
  if (pathname.startsWith("/og/docs")) {
    return true;
  }
  // The docs site's own nav links here (apps/docs/lib/layout.shared.tsx) and the
  // page lives outside its /docs tree, in the (home) route group — so without
  // this the link lands on the SPA, which has no such route.
  if (pathname === "/changelog") {
    return true;
  }
  if (pathname === "/llms-full.txt" || pathname.startsWith("/llms")) {
    return true;
  }
  return false;
}

/** Paths served by core Hono; everything else is routed to a gateway upstream. */
export function resolveGatewayTarget(pathname: string): GatewayTarget | null {
  if (isDocsGatewayPath(pathname)) {
    return "docs";
  }
  if (pathname.startsWith("/api") || pathname.startsWith("/gateway")) {
    return null;
  }
  // Agent auth discovery (auth.md protocol) is served by core itself.
  if (
    pathname === "/auth.md" ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/oauth2/")
  ) {
    return null;
  }
  if (pathname === "/ai" || pathname.startsWith("/ai/")) {
    return "ai";
  }
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    return "studio";
  }
  if (isManageGatewayPath(pathname)) {
    return "manage";
  }
  return "ui";
}
