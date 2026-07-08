import { DockSettingsIcon } from "@engenty/ui-core";
import type {
  UiContributions,
  UiCopilotAppContribution,
} from "@engenty/ui-plugin-sdk";
import {
  BarChart3,
  Box,
  Code2,
  Flag,
  Palette,
  Search,
  Sparkles,
} from "lucide-react";
import type { NavigationItem, NavigationSection } from "../types/shell";

type TranslateFn = (key: string) => string;

type AdminMenuEntry = UiContributions["adminMenuItems"][number];

/** Synthetic admin rows (after contribution items). */
const ADMIN_NAV_ORDER_SETTINGS = 140;

/**
 * Canonical order for core admin menu contributions (by stable `id`).
 * Ensures sidebar order even if `order` on contributions is stale (e.g. dev session cache).
 */
const ADMIN_MENU_SORT_RANK_BY_ID: Record<string, number> = {
  ai_ui_admin_menu: 100,
  files_admin_menu: 110,
  audit_logs_menu: 120,
  user_management_menu: 130,
};

function resolveContributionLabel(
  contribution: { label: string; labelKey?: string },
  t: TranslateFn
): string {
  return contribution.labelKey ? t(contribution.labelKey) : contribution.label;
}

function mapTopLevelEntryToNavItem(
  entry: AdminMenuEntry,
  entries: AdminMenuEntry[],
  t: TranslateFn
): NavigationItem {
  const children = entries
    .filter((candidate) => candidate.parentId === entry.id)
    .map((candidate) => ({
      to: candidate.to,
      label: resolveContributionLabel(candidate, t),
    }));

  return {
    to: entry.to,
    label: resolveContributionLabel(entry, t),
    icon: entry.icon ?? Box,
    children: children.length > 0 ? children : undefined,
    ...(entry.useBadgeCount ? { useBadgeCount: entry.useBadgeCount } : {}),
  };
}

function mapCopilotAppToNavItem(
  app: UiCopilotAppContribution,
  t: TranslateFn
): NavigationItem {
  return {
    to: app.to,
    label: resolveContributionLabel(app, t),
    icon: app.icon ?? Box,
  };
}

function buildCopilotNavItems(
  copilotApps: UiContributions["copilotApps"],
  t: TranslateFn
): NavigationItem[] {
  return [...copilotApps]
    .sort((left, right) => (left.order ?? 10_000) - (right.order ?? 10_000))
    .map((app) => mapCopilotAppToNavItem(app, t));
}

function buildSectionItems(
  entries: UiContributions["adminMenuItems"],
  t: TranslateFn
): NavigationItem[] {
  const topLevel = entries.filter((entry) => !entry.parentId);
  return topLevel.map((entry) => mapTopLevelEntryToNavItem(entry, entries, t));
}

function adminMenuContributionSortKey(entry: AdminMenuEntry): number {
  const byId = ADMIN_MENU_SORT_RANK_BY_ID[entry.id];
  if (byId !== undefined) {
    return byId;
  }
  return entry.order ?? 10_000;
}

function compareOrderedAdminRows(
  left: { sortKey: number; item: NavigationItem },
  right: { sortKey: number; item: NavigationItem }
) {
  if (left.sortKey !== right.sortKey) {
    return left.sortKey - right.sortKey;
  }
  return left.item.to.localeCompare(right.item.to);
}

function buildAdminNavItems(
  adminEntries: AdminMenuEntry[],
  settingsItem: NavigationItem,
  t: TranslateFn
): NavigationItem[] {
  const topLevel = adminEntries.filter((entry) => !entry.parentId);
  const fromContributions = topLevel
    .map((entry) => ({
      sortKey: adminMenuContributionSortKey(entry),
      item: mapTopLevelEntryToNavItem(entry, adminEntries, t),
    }))
    .sort(compareOrderedAdminRows);
  const merged = [
    ...fromContributions,
    { sortKey: ADMIN_NAV_ORDER_SETTINGS, item: settingsItem },
  ].sort(compareOrderedAdminRows);
  return merged.map((row) => row.item);
}

export function buildNavigationSections(
  contributions: UiContributions,
  options: { isSuperAdmin?: boolean } = {},
  t: TranslateFn = (k: string) => k
): NavigationSection[] {
  const isSuperAdmin = options.isSuperAdmin === true;
  const tasksMenuItem = contributions.adminMenuItems.find(
    (entry) => entry.id === "tasks_module_menu"
  );
  const moduleItems = buildSectionItems(
    contributions.adminMenuItems.filter(
      (entry) => entry.section === "modules" && entry.id !== "tasks_module_menu"
    ),
    t
  );
  const copilotNavItems = buildCopilotNavItems(contributions.copilotApps, t);
  const adminMenuEntries = contributions.adminMenuItems.filter(
    (entry) => entry.section === "admin"
  );
  const coreSettingsChildren = [
    { to: "/settings/ai", label: "AI", icon: Sparkles },
    {
      to: "/settings/ai-usage",
      label: t("settings.aiUsage.menuLabel"),
      icon: BarChart3,
    },
    {
      to: "/settings/appearance",
      label: t("settings.appearanceTitle"),
      icon: Palette,
    },
    {
      to: "/settings/development",
      label: t("settings.development.title"),
      icon: Code2,
    },
    ...(isSuperAdmin
      ? [
          {
            to: "/settings/features",
            label: t("featureFlags.title"),
            icon: Flag,
          },
          {
            to: "/settings/search-index",
            label: t("settings.searchIndex.title"),
            icon: Search,
          },
        ]
      : []),
  ];
  const settingsChildren = [
    ...coreSettingsChildren,
    ...(contributions.settingsItems.length > 0
      ? [{ to: "", label: "", type: "separator" as const }]
      : []),
    ...contributions.settingsItems
      .filter(
        (item) => item.to !== "/settings/profile" && item.to !== "/settings/ai"
      )
      .map((item) => ({
        to: item.to,
        label: resolveContributionLabel(item, t),
        icon: item.icon,
      })),
  ];

  return [
    {
      items: [
        ...copilotNavItems,
        ...(tasksMenuItem
          ? [
              mapTopLevelEntryToNavItem(
                tasksMenuItem,
                contributions.adminMenuItems,
                t
              ),
            ]
          : []),
      ],
    },
    {
      label: t("navigation.modules"),
      items: moduleItems,
    },
    {
      label: t("navigation.admin"),
      items: (() => {
        const settingsItem = {
          to: "/settings",
          label: t("navigation.settings"),
          icon: DockSettingsIcon,
          children: settingsChildren.length > 0 ? settingsChildren : undefined,
        };
        return buildAdminNavItems(adminMenuEntries, settingsItem, t);
      })(),
    },
  ];
}

function flattenItems(sections: NavigationSection[]) {
  return sections.flatMap((section) => section.items);
}

function stripQuery(path: string) {
  const [pathname] = path.split("?");
  return pathname;
}

export function matchesPath(
  currentPath: string,
  currentSearch: string,
  itemPath: string
) {
  const pathOnly = stripQuery(itemPath);
  const itemUrl = new URL(itemPath, "http://ui.local");

  if (pathOnly === "/") {
    return currentPath === "/";
  }

  if (!currentPath.startsWith(pathOnly)) {
    return false;
  }

  const currentParams = new URLSearchParams(currentSearch);
  const expectedStatus = itemUrl.searchParams.get("status");
  if (expectedStatus !== null && expectedStatus !== undefined) {
    return currentParams.get("status") === expectedStatus;
  }
  const expectedRole = itemUrl.searchParams.get("role");
  if (expectedRole !== null && expectedRole !== undefined) {
    return currentParams.get("role") === expectedRole;
  }
  // Path-only link (e.g. "Alle" -> /mdl/contacts): active when no role filter
  return currentParams.get("role") === null || currentParams.get("role") === "";
}

export function findActiveNavLabel(
  currentPath: string,
  currentSearch: string,
  sections: NavigationSection[],
  t?: TranslateFn
) {
  for (const item of flattenItems(sections)) {
    if (
      item.children?.some((child) =>
        matchesPath(currentPath, currentSearch, child.to)
      )
    ) {
      const activeChild = item.children.find((child) =>
        matchesPath(currentPath, currentSearch, child.to)
      );
      return activeChild?.label ?? item.label;
    }
    if (matchesPath(currentPath, currentSearch, item.to)) {
      return item.label;
    }
  }
  return t ? t("navigation.dashboard") : "Dashboard";
}

export function getSecondaryNavItems(
  currentPath: string,
  currentSearch: string,
  sections: NavigationSection[]
): NavigationItem["children"] | null {
  for (const item of flattenItems(sections)) {
    // If we're exactly matching the parent route or any of its children,
    // and the parent has children, this parent "owns" the secondary nav.
    if (
      matchesPath(currentPath, currentSearch, item.to) ||
      item.children?.some((child) =>
        matchesPath(currentPath, currentSearch, child.to)
      )
    ) {
      return item.children && item.children.length > 0 ? item.children : null;
    }
  }

  // Fallback for settings if currentPath is underneath but not explicitly matched above
  if (currentPath.startsWith("/settings")) {
    const settingsItem = flattenItems(sections).find(
      (i) => i.to === "/settings"
    );
    if (settingsItem?.children && settingsItem.children.length > 0) {
      return settingsItem.children;
    }
  }

  return null;
}
