import { NAVIGATE_SPEC } from "./definition.js";

export type NavigateLike = (to: string, opts?: { replace?: boolean }) => void;

/** The router's live route table, injected by the register layer. */
export interface NavigateRouteTable {
  /** True when `pattern` matches `pathname`. */
  matches: (pattern: string, pathname: string) => boolean;
  /** Registered route patterns, e.g. `/mdl/contacts/:id`. */
  patterns: string[];
}

export type NavigateTargetResolution =
  | { candidates: string[]; ok: false }
  | { ok: true; resolvedFrom?: string; to: string };

/** How many real routes an unresolvable target lists back to the agent. */
const MAX_CANDIDATES = 12;

/**
 * The only prefix the route table is COMPLETE for: every `/mdl/*` route comes
 * from a module plugin. The host declares ~25 routes inline in
 * `AuthenticatedRoutes` (`/dashboard`, `/settings/ai`, …) that never reach the
 * contribution list, so elsewhere "absent" means unseen, not missing.
 */
const VALIDATED_PATH_PREFIX = "/mdl/";

function hasRouteParams(pattern: string): boolean {
  return pattern.includes(":") || pattern.includes("*");
}

/** Splits `/mdl/inbox/1?ts=2#x` into its pathname and everything after it. */
function splitPathname(to: string): { pathname: string; suffix: string } {
  const cut = to.search(/[?#]/);
  return cut === -1
    ? { pathname: to, suffix: "" }
    : { pathname: to.slice(0, cut), suffix: to.slice(cut) };
}

function trimTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** Routes worth showing when `to` matched nothing, widening the prefix. */
function suggestRoutes(pathname: string, patterns: string[]): string[] {
  const prefix = trimTrailingSlash(pathname);
  const parts = segments(prefix);
  const tiers = [
    `${prefix}/`,
    parts.length > 1 ? `/${parts.slice(0, 2).join("/")}` : null,
    parts.length > 0 ? `/${parts[0]}/` : null,
  ];
  for (const tier of tiers) {
    if (!tier) {
      continue;
    }
    const hits = patterns.filter((pattern) => pattern.startsWith(tier));
    if (hits.length > 0) {
      return hits.slice(0, MAX_CANDIDATES);
    }
  }
  return [];
}

/**
 * Decides where `to` actually goes. A module's route prefix is NOT a route:
 * `/mdl/commercial-settings` registers nothing, so it fell through to the
 * `path="*"` catch-all, which redirects to the last Space home. A prefix
 * owning exactly one static child resolves to it; anything else fails loudly
 * with the real routes listed, because the tool returning `{ok:true}` for a path
 * that went nowhere is what let the agent claim it had opened the page.
 */
export function resolveNavigateTarget(input: {
  routes: NavigateRouteTable;
  to: string;
}): NavigateTargetResolution {
  const { pathname, suffix } = splitPathname(input.to);
  const { matches, patterns } = input.routes;

  if (patterns.some((pattern) => matches(pattern, pathname))) {
    return { ok: true, to: input.to };
  }
  if (!pathname.startsWith(VALIDATED_PATH_PREFIX)) {
    return { ok: true, to: input.to };
  }

  const prefix = trimTrailingSlash(pathname);
  const staticChildren = patterns.filter(
    (pattern) => pattern.startsWith(`${prefix}/`) && !hasRouteParams(pattern)
  );
  if (staticChildren.length === 1) {
    return { ok: true, resolvedFrom: input.to, to: staticChildren[0] + suffix };
  }

  return { candidates: suggestRoutes(pathname, patterns), ok: false };
}

export interface NavigateFrontendToolResult {
  ok: true;
  /** Present only when `to` was a prefix and we resolved it to a real route. */
  resolved_from?: string;
  /** Where the app was actually sent — not necessarily what the agent asked for. */
  to: string;
}

// Runtime authority for both the typed register handler and the untyped executor
// path (input: unknown), so it validates against the tool's single-source zod
// schema instead of re-parsing by hand. The internal-path check is security
// logic beyond the schema and is kept.
export function runNavigateFrontendTool(
  input: unknown,
  navigate: NavigateLike,
  options?: { onNavigate?: () => void; routes?: NavigateRouteTable }
): NavigateFrontendToolResult {
  const parsed = NAVIGATE_SPEC.schema.safeParse(input);
  if (!(parsed.success && parsed.data.to.trim())) {
    throw new Error(
      'navigate requires input {"to":"/mdl/<moduleId>/<page>"} (internal path).'
    );
  }
  const requested = parsed.data.to.trim();
  if (!requested.startsWith("/") || requested.startsWith("//")) {
    throw new Error("Only internal application paths are allowed.");
  }

  // No table yet (contributions unresolved): navigate unvalidated rather than
  // refuse every path because we cannot see it.
  const resolution: NavigateTargetResolution = options?.routes
    ? resolveNavigateTarget({ routes: options.routes, to: requested })
    : { ok: true, to: requested };

  if (!resolution.ok) {
    const listed = resolution.candidates.length
      ? ` Registered routes here: ${resolution.candidates.join(", ")}.`
      : " No route is registered under that prefix.";
    throw new Error(
      `No page is registered at ${requested}.${listed} Navigate to one of these exact paths — a module's base path is not automatically a page.`
    );
  }

  navigate(resolution.to, { replace: parsed.data.replace === true });
  options?.onNavigate?.();
  return {
    ok: true,
    ...(resolution.resolvedFrom
      ? { resolved_from: resolution.resolvedFrom }
      : {}),
    to: resolution.to,
  };
}
