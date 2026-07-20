export type GatewayTarget = "ai" | "docs" | "manage" | "studio" | "ui";

/** Manage (`apps/manage`) when served under `/manage` on the gateway host. */
export function isManageGatewayPath(pathname: string): boolean {
  return pathname === "/manage" || pathname.startsWith("/manage/");
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
