import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import type React from "react";
import { createElement } from "react";
import type { NavigationItem, NavigationSection } from "../types/shell";

function stripQuery(path: string): string {
  return path.split("?")[0] ?? path;
}

function findBestNavItem(
  first: PageBreadcrumb,
  pathname: string,
  sections: NavigationSection[]
): NavigationItem | null {
  const flat = sections.flatMap((s) => s.items);
  const pathNorm = stripQuery(pathname);
  const target = first.to ? stripQuery(first.to) : pathNorm;

  let best: NavigationItem | null = null;
  let bestLen = -1;

  for (const item of flat) {
    const base = stripQuery(item.to);
    if (!base) {
      continue;
    }
    if (
      (target === base || target.startsWith(`${base}/`)) &&
      base.length > bestLen
    ) {
      bestLen = base.length;
      best = item;
    }
  }

  if (best) {
    return best;
  }

  for (const item of flat) {
    const base = stripQuery(item.to);
    if (!base) {
      continue;
    }
    if (
      (pathNorm === base || pathNorm.startsWith(`${base}/`)) &&
      base.length > bestLen
    ) {
      bestLen = base.length;
      best = item;
    }
  }
  return best;
}

function rootTooltipText(first: PageBreadcrumb, nav: NavigationItem): string {
  if (first.tooltip) {
    return first.tooltip;
  }
  if (first.menuLabel) {
    return first.menuLabel;
  }
  if (typeof first.label === "string") {
    return first.label;
  }
  return nav.label;
}

/**
 * Replaces the first breadcrumb label with the matching primary-nav icon when
 * the segment is not already customized (`icon` unset). Tooltip text uses the
 * prior label (or nav label). Always sets `to: nav.to` so the icon is linked
 * even when the original first item was a custom element (e.g. a picker) with
 * no `to` of its own.
 *
 * Pass `suppress: true` when the icon is already shown elsewhere (e.g. the
 * topbar beside the breadcrumb when the secondary nav column is pinned open)
 * so the breadcrumb stays text-only.
 */
export function enrichFirstBreadcrumbWithNavIcon(
  items: PageBreadcrumb[],
  pathname: string,
  sections: NavigationSection[],
  options?: { suppress?: boolean }
): PageBreadcrumb[] {
  if (items.length === 0) {
    return items;
  }
  if (options?.suppress) {
    return items;
  }
  const first = items[0];
  if (first.icon) {
    return items;
  }

  const nav = findBestNavItem(first, pathname, sections);
  if (!nav) {
    return items;
  }

  const Icon = nav.icon;
  const tooltip =
    typeof first.label === "string" ? rootTooltipText(first, nav) : nav.label;

  return [
    {
      ...first,
      // Icon always targets the primary-nav module root (`nav.to`), never a
      // deeper first-segment `to` (e.g. KB hub) from page breadcrumbs.
      to: nav.to,
      icon: createElement(Icon, { "aria-hidden": true, className: "size-4" }),
      menuLabel: first.menuLabel ?? tooltip,
      tooltip,
    },
    ...items.slice(1),
  ];
}

/**
 * Returns the icon element and root `to` path for the primary-nav item that
 * best matches the current path — used to render the module icon in the
 * topbar module root link when the secondary nav column is pinned open.
 *
 * Works even when `breadcrumbs` is empty (e.g. KB hub page with sidebar open):
 * falls back to matching purely by `pathname`.
 */
export function findNavIconForPath(
  breadcrumbs: PageBreadcrumb[],
  pathname: string,
  sections: NavigationSection[]
): { icon: React.ReactElement; label: string; to: string } | null {
  // Use the first breadcrumb as a hint; if absent, synthesise a placeholder
  // that has no `to` — findBestNavItem will then match purely by pathname.
  const first: PageBreadcrumb = breadcrumbs[0] ?? { label: "" };
  const nav = findBestNavItem(first, pathname, sections);
  if (!nav) {
    return null;
  }
  return {
    icon: createElement(nav.icon, { "aria-hidden": true, className: "size-4" }),
    label: nav.label,
    to: nav.to,
  };
}
