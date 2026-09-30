import { spaceModuleUrlSegment } from "@engenty/ai-core/browser";
import type { ComponentType } from "react";
import { matchPath } from "react-router-dom";

const MODULE_PREFIX = "/mdl/";

export interface ViewRoute {
  Component: ComponentType;
  path: string;
}

/**
 * Every module route twice: `/mdl/<module>/…` and its Space mirror
 * `/s/:spaceKey/<segment>/…` (the shell's own mirroring rule, restated here
 * because the shell lives in apps/ui and this pane in ai-ui).
 */
export function viewRoutes(
  routes: readonly { component: ComponentType; path: string }[]
): ViewRoute[] {
  const out: ViewRoute[] = [];
  for (const route of routes) {
    out.push({ Component: route.component, path: route.path });
    if (!route.path.startsWith(MODULE_PREFIX)) {
      continue;
    }
    const tail = route.path.slice(MODULE_PREFIX.length);
    const slash = tail.indexOf("/");
    const moduleId = slash === -1 ? tail : tail.slice(0, slash);
    if (!moduleId) {
      continue;
    }
    const rest = slash === -1 ? "" : tail.slice(slash);
    out.push({
      Component: route.component,
      path: `/s/:spaceKey/${spaceModuleUrlSegment(moduleId)}${rest}`,
    });
  }
  return out;
}

function pathnameOf(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/** True when the View Pane can render `path` (query and hash ignored). */
export function viewPathMatches(
  path: string,
  routes: readonly { component: ComponentType; path: string }[]
): boolean {
  const pathname = pathnameOf(path);
  return viewRoutes(routes).some(
    (route) => matchPath({ end: true, path: route.path }, pathname) !== null
  );
}
