import { DockSettingsIcon } from "@engenty/ui-core";
import type {
  UiContributions,
  UiCopilotAppContribution,
  UiIconComponent,
} from "@engenty/ui-plugin-sdk";
import {
  BarChart3,
  Box,
  Cable,
  Code2,
  Flag,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { NavigationItem, NavigationSection } from "../types/shell";

type TranslateFn = (key: string) => string;

type AdminMenuEntry = UiContributions["adminMenuItems"][number];
type SettingsMenuEntry = UiContributions["settingsItems"][number];

function moduleRootFromPath(path: string): string | null {
  const match = path.match(/^\/mdl\/([^/]+)/);
  return match?.[1] ?? null;
}

/** Reuse the module dock icon from admin menu when a settings row omits one. */
function resolveSettingsItemIcon(
  item: SettingsMenuEntry,
  adminMenuItems: AdminMenuEntry[]
): UiIconComponent | undefined {
  if (item.icon) {
    return item.icon;
  }
  const moduleRoot = moduleRootFromPath(item.to);
  if (!moduleRoot) {
    return;
  }
  const prefix = `/mdl/${moduleRoot}`;
  const moduleMenu = adminMenuItems.find(
    (entry) =>
      entry.section === "modules" &&
      (entry.to === prefix || entry.to.startsWith(`${prefix}/`))
  );
  return moduleMenu?.icon;
}

/** Synthetic admin rows (after contribution items). */
const ADMIN_NAV_ORDER_SETTINGS = 140;
/** Install-owner setup area — after Settings, superadmin only. */
const ADMIN_NAV_ORDER_SETUP = 150;

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
  t: TranslateFn,
  setupItem: NavigationItem | null
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
    ...(setupItem ? [{ sortKey: ADMIN_NAV_ORDER_SETUP, item: setupItem }] : []),
  ].sort(compareOrderedAdminRows);
  return merged.map((row) => row.item);
}

export function buildNavigationSections(
  contributions: UiContributions,
  options: {
    developerModeEnabled?: boolean;
    isSuperAdmin?: boolean;
    isTenantAdmin?: boolean;
  } = {},
  t: TranslateFn = (k: string) => k
): NavigationSection[] {
  const isSuperAdmin = options.isSuperAdmin === true;
  const isTenantAdmin = options.isTenantAdmin === true;
  const isAdmin = isSuperAdmin || isTenantAdmin;
  const developerModeEnabled = options.developerModeEnabled === true;
  const tasksMenuItem = contributions.adminMenuItems.find(
    (entry) => entry.id === "tasks_module_menu"
  );
  const projectsMenuItem = contributions.adminMenuItems.find(
    (entry) => entry.id === "projects_module_menu"
  );
  const moduleItems = buildSectionItems(
    contributions.adminMenuItems.filter(
      (entry) =>
        entry.section === "modules" &&
        entry.id !== "tasks_module_menu" &&
        entry.id !== "projects_module_menu"
    ),
    t
  );
  const copilotNavItems = buildCopilotNavItems(contributions.copilotApps, t);
  // Admin-section entries (/admin/* consoles: users, audit logs, files, agents
  // workspace, context graph) are tenant-admin surfaces — hidden for members.
  const adminMenuEntries = isAdmin
    ? contributions.adminMenuItems.filter((entry) => entry.section === "admin")
    : [];
  // Connections is a personal surface (`requiresAdmin: false`) but lives in the
  // core settings block (after Roles, before developer-mode / module rows), not
  // among module settings below the separator.
  const CONNECTIONS_SETTINGS_TO = "/settings/connections";
  const connectionsSettingsItem = contributions.settingsItems.find(
    (item) => item.to === CONNECTIONS_SETTINGS_TO
  );
  const mapSettingsContribution = (item: SettingsMenuEntry) => ({
    to: item.to,
    label: resolveContributionLabel(item, t),
    icon: resolveSettingsItemIcon(item, contributions.adminMenuItems),
  });
  const connectionsNavItem =
    connectionsSettingsItem &&
    (isAdmin || connectionsSettingsItem.requiresAdmin === false)
      ? mapSettingsContribution(connectionsSettingsItem)
      : null;
  // Module settings below the separator — Connections is promoted above.
  const moduleSettingsItems = contributions.settingsItems
    .filter(
      (item) =>
        item.to !== "/settings/profile" &&
        item.to !== "/settings/ai" &&
        item.to !== CONNECTIONS_SETTINGS_TO
    )
    // Module settings are tenant configuration — hidden from members, who see
    // only genuinely personal surfaces (declared via `requiresAdmin: false`).
    .filter((item) => isAdmin || item.requiresAdmin === false);

  const coreSettingsChildren = [
    // Tenant configuration — admins only. Members are end users: their Settings
    // holds no tenant-wide surfaces (Appearance here is the tenant branding
    // editor; personal theme/language live in the user menu).
    ...(isAdmin
      ? [
          {
            to: "/settings/appearance",
            label: t("settings.appearanceTitle"),
            icon: Palette,
          },
          {
            to: "/settings/ai",
            label: t("settings.aiModels.menuLabel"),
            icon: Sparkles,
          },
          {
            to: "/settings/ai-usage",
            label: t("settings.aiUsage.menuLabel"),
            icon: BarChart3,
          },
          {
            to: "/settings/roles",
            label: t("settings.roles.menuLabel"),
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(connectionsNavItem ? [connectionsNavItem] : []),
    ...(developerModeEnabled
      ? [
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
        ]
      : []),
  ];
  const settingsChildren = [
    ...coreSettingsChildren,
    ...(moduleSettingsItems.length > 0
      ? [{ to: "", label: "", type: "separator" as const }]
      : []),
    ...moduleSettingsItems.map(mapSettingsContribution),
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
        ...(projectsMenuItem
          ? [
              mapTopLevelEntryToNavItem(
                projectsMenuItem,
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
          // Keep the gear at /settings for everyone so the settings secondary
          // nav resolves on every /settings/* page; the route guard redirects
          // members off the admin-only General page to /settings/appearance.
          to: "/settings",
          label: t("navigation.settings"),
          icon: DockSettingsIcon,
          children: settingsChildren.length > 0 ? settingsChildren : undefined,
        };
        const setupItem = isSuperAdmin
          ? {
              to: "/setup",
              label: t("navigation.setup"),
              icon: Wrench,
              children: [
                {
                  to: "/setup/connectors",
                  label: t("navigation.setupConnectors"),
                  icon: Cable,
                },
              ],
            }
          : null;
        return buildAdminNavItems(adminMenuEntries, settingsItem, t, setupItem);
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

function isNavigablePath(itemPath: string): boolean {
  const pathOnly = stripQuery(itemPath);
  return pathOnly.length > 0;
}

function isSecondaryNavLinkChild(child: {
  to: string;
  type?: "link" | "separator";
}): boolean {
  return child.type !== "separator" && isNavigablePath(child.to);
}

export function matchesPath(
  currentPath: string,
  currentSearch: string,
  itemPath: string
) {
  const pathOnly = stripQuery(itemPath);
  // Separators use `to: ""`; `startsWith("")` is always true and would steal
  // secondary-nav ownership (e.g. Settings claiming /setup/*).
  if (!isNavigablePath(itemPath)) {
    return false;
  }

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
    const linkChildren = item.children?.filter(isSecondaryNavLinkChild);
    if (
      linkChildren?.some((child) =>
        matchesPath(currentPath, currentSearch, child.to)
      )
    ) {
      const activeChild = linkChildren.find((child) =>
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
    // Skip separators — empty `to` must not claim ownership of every path.
    const linkChildren = item.children?.filter(isSecondaryNavLinkChild);
    if (
      matchesPath(currentPath, currentSearch, item.to) ||
      linkChildren?.some((child) =>
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

  if (currentPath.startsWith("/setup")) {
    const setupItem = flattenItems(sections).find((i) => i.to === "/setup");
    if (setupItem?.children && setupItem.children.length > 0) {
      return setupItem.children;
    }
  }

  return null;
}
