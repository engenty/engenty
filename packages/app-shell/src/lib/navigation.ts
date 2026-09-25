import { DockSettingsIcon, DockSetupIcon } from "@engenty/ui-core";
import type { UiContributions, UiIconComponent } from "@engenty/ui-plugin-sdk";
import { PLUGIN_CATEGORIES, pluginCategoryRank } from "@engenty/ui-plugin-sdk";
import {
  Bell,
  Box,
  Boxes,
  Building2,
  Cable,
  Clapperboard,
  Code2,
  Flag,
  KeyRound,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
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
  // Engenty workspace — first in the bottom admin rail (above Vault / Settings).
  ai_ui_admin_menu: 100,
  files_admin_menu: 110,
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
    id: entry.id,
    to: entry.to,
    label: resolveContributionLabel(entry, t),
    icon: entry.icon ?? Box,
    children: children.length > 0 ? children : undefined,
    ...(entry.useBadgeCount ? { useBadgeCount: entry.useBadgeCount } : {}),
  };
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

const AGENTS_WORKSPACE_PATH = "/admin/engenty";

function isAgentsWorkspaceEntry(to: string): boolean {
  return (
    to === AGENTS_WORKSPACE_PATH || to.startsWith(`${AGENTS_WORKSPACE_PATH}/`)
  );
}

export function buildNavigationSections(
  contributions: UiContributions,
  options: {
    canSwitchTenant?: boolean;
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
  const canSwitchTenant = isSuperAdmin && options.canSwitchTenant === true;
  // Zone ③ is GLOBAL APPS only (PLAN-spaces.md Phase 5a): tools you carry
  // across every space. Space-placed modules (tasks, projects, offers, the kb,
  // …) are reached inside a space, so they leave the rail entirely rather than
  // being special-cased out of it one id at a time, which is what the old
  // `tasks_module_menu`/`projects_module_menu` exclusions were.
  //
  // The section id stays `"modules"` on purpose — `applyDockModuleOrder`
  // filters on it, so renaming it would silently break tenant-curated rail
  // order and the persisted `shell.dock_module_order`, for a cosmetic gain.
  // Empty on a default install (no in-repo module declares "global"), which
  // drops the whole zone — `sectionsWithItems` never renders an empty heading.
  const moduleMenuEntries = contributions.adminMenuItems.filter(
    (entry) => entry.section === "modules" && entry.placement === "global"
  );
  const moduleTopLevel = moduleMenuEntries
    .filter((entry) => !entry.parentId)
    .slice()
    .sort((left, right) => {
      const byCategory =
        pluginCategoryRank(left.category) - pluginCategoryRank(right.category);
      if (byCategory !== 0) {
        return byCategory;
      }
      return (left.order ?? 10_000) - (right.order ?? 10_000);
    });
  const moduleItems = moduleTopLevel.map((entry) =>
    mapTopLevelEntryToNavItem(entry, moduleMenuEntries, t)
  );
  // Admin-section entries (/admin/* consoles: Engenty, files, context graph)
  // are tenant-admin surfaces — hidden for members. Engenty is ordered first
  // via ADMIN_MENU_SORT_RANK_BY_ID (not the primary top rail). Audit logs are
  // reachable from the Setup overview only; users from the Settings overview
  // (`/settings/users`) — neither gets a rail or secondary-nav slot.
  // The Engenty workspace (/admin/engenty) is a debugging surface — superadmins
  // with developer mode on only.
  const showAgentsWorkspace = isSuperAdmin && developerModeEnabled;
  const adminMenuEntries = isAdmin
    ? contributions.adminMenuItems.filter(
        (entry) =>
          entry.section === "admin" &&
          (showAgentsWorkspace || !isAgentsWorkspaceEntry(entry.to))
      )
    : [];
  // Connections is a personal surface (`requiresAdmin: false`). Admins see it
  // in Setup; members keep it in Settings (they have no Setup rail).
  const CONNECTIONS_PATH = "/setup/connections";
  const connectionsSettingsItem = contributions.settingsItems.find(
    (item) => item.to === CONNECTIONS_PATH
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
  // Module settings below the separator — Connections is promoted into Setup
  // (admins) or the core Settings block (members).
  // Groups follow PLUGIN_CATEGORIES; item `order` sorts within a category only.
  const moduleSettingsItems = contributions.settingsItems
    .filter(
      (item) => item.to !== "/settings/profile" && item.to !== CONNECTIONS_PATH
    )
    // Module settings are tenant configuration — hidden from members, who see
    // only genuinely personal surfaces (declared via `requiresAdmin: false`).
    .filter((item) => isAdmin || item.requiresAdmin === false)
    .slice()
    .sort((left, right) => {
      const byCategory =
        pluginCategoryRank(left.category) - pluginCategoryRank(right.category);
      if (byCategory !== 0) {
        return byCategory;
      }
      return (left.order ?? 10_000) - (right.order ?? 10_000);
    });

  const moduleSettingsChildren = appendModuleSettingsWithCategoryHeadings(
    moduleSettingsItems,
    mapSettingsContribution,
    t
  );

  const coreSettingsChildren = [
    // Tenant configuration — admins only. Members are end users: their Settings
    // holds no tenant-wide surfaces (Appearance here is the tenant branding
    // editor; personal theme/language live in the user menu).
    ...(isAdmin
      ? [
          ...(canSwitchTenant
            ? [
                {
                  to: "/settings/tenant",
                  label: t("settings.tenant.title"),
                  icon: Building2,
                },
              ]
            : []),
          {
            // Spaces (PLAN-spaces.md Phase 3b). A temporary home: Phase 5 gives
            // the rail a spaces zone and "New space" moves there, leaving this
            // as the admin list. Admin-gated because mounting issues grants.
            to: "/settings/spaces",
            label: t("spaces.title"),
            icon: Boxes,
          },
          {
            to: "/settings/appearance",
            label: t("settings.appearanceTitle"),
            icon: Palette,
          },
          {
            // Streams + routes post into messengers — a governance surface.
            to: "/settings/notifications",
            label: t("settings.notificationStreamsTitle"),
            icon: Bell,
          },
        ]
      : []),
    // Members have no Setup rail — Connections stays findable in Settings.
    ...(!isAdmin && connectionsNavItem ? [connectionsNavItem] : []),
  ];
  const settingsChildren = [
    ...coreSettingsChildren,
    ...(moduleSettingsChildren.length > 0
      ? [{ to: "", label: "", type: "separator" as const }]
      : []),
    ...moduleSettingsChildren,
  ];

  // An empty section is dropped, not rendered empty. The renderer gives every
  // section a label and a trailing separator, so a section with no items shows
  // an "Apps" heading over nothing and a rule floating between its neighbours —
  // the same stray separator that got the `primary` section deleted below.
  return sectionsWithItems([
    // The `primary` section is GONE (Phase 5a ③): Tasks/Projects moved into
    // the space and left it empty. Zone ③ is spaces → tools you carry
    // BETWEEN spaces. Records modules stay off the rail, and so does Copilot:
    // it is reached inside a space (the Work list) and from the blob at the
    // personal end of the bar — a third door beside the spaces read as a
    // fourth kind of thing on a rail that is otherwise spaces and apps.
    {
      id: "modules",
      label: t("navigation.apps"),
      items: moduleItems,
    },
    {
      id: "admin",
      label: t("navigation.admin"),
      items: (() => {
        const settingsItem = {
          // Keep the gear at /settings for everyone so the settings secondary
          // nav resolves on every /settings/* page; the route guard redirects
          // members off the admin-only General page to /settings/appearance.
          id: "shell_settings",
          to: "/settings",
          label: t("navigation.settings"),
          icon: DockSettingsIcon,
          children: settingsChildren.length > 0 ? settingsChildren : undefined,
        };
        const setupChildren = [
          ...(isSuperAdmin
            ? [
                {
                  to: "/setup/platform",
                  label: t("navigation.setupPlatform"),
                  icon: KeyRound,
                },
                {
                  to: "/setup/plugins",
                  label: t("navigation.plugins"),
                  icon: Box,
                },
                {
                  to: "/setup/roles",
                  label: t("settings.roles.menuLabel"),
                  icon: ShieldCheck,
                },
                {
                  to: "/setup/connectors",
                  label: t("navigation.setupConnectors"),
                  icon: Cable,
                },
              ]
            : []),
          ...(isAdmin
            ? [
                {
                  to: "/setup/ai",
                  label: t("settings.aiModels.menuLabel"),
                  icon: Sparkles,
                },
                {
                  to: "/setup/integration-keys",
                  label: t("settings.integrationKeys.menuLabel"),
                  icon: KeyRound,
                },
                ...(connectionsNavItem ? [connectionsNavItem] : []),
              ]
            : []),
          ...(developerModeEnabled
            ? [
                {
                  to: "/setup/development",
                  label: t("settings.development.title"),
                  icon: Code2,
                },
                {
                  to: "/setup/studio",
                  label: t("navigation.mastraStudio"),
                  icon: Clapperboard,
                },
                ...(isSuperAdmin
                  ? [
                      {
                        to: "/setup/features",
                        label: t("featureFlags.title"),
                        icon: Flag,
                      },
                      {
                        to: "/setup/search-index",
                        label: t("settings.searchIndex.title"),
                        icon: Search,
                      },
                    ]
                  : []),
              ]
            : []),
        ];
        const setupItem =
          setupChildren.length > 0
            ? {
                id: "shell_setup",
                to: "/setup",
                label: t("navigation.setup"),
                icon: DockSetupIcon,
                children: setupChildren,
              }
            : null;
        return buildAdminNavItems(adminMenuEntries, settingsItem, t, setupItem);
      })(),
    },
  ]);
}

/** Sections that would render as a heading over nothing are left out entirely. */
function sectionsWithItems(sections: NavigationSection[]): NavigationSection[] {
  return sections.filter((section) => section.items.length > 0);
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

function appendModuleSettingsWithCategoryHeadings(
  items: SettingsMenuEntry[],
  mapItem: (item: SettingsMenuEntry) => {
    icon: ReturnType<typeof resolveSettingsItemIcon>;
    label: string;
    to: string;
  },
  t: TranslateFn
) {
  const out: Array<
    | {
        icon: ReturnType<typeof resolveSettingsItemIcon>;
        label: string;
        to: string;
      }
    | { label: string; to: ""; type: "heading" }
  > = [];
  const byCategory = new Map<string, SettingsMenuEntry[]>();
  for (const item of items) {
    const key = item.category ?? "other";
    const list = byCategory.get(key) ?? [];
    list.push(item);
    byCategory.set(key, list);
  }
  const categoryKeys = [
    ...PLUGIN_CATEGORIES,
    ...[...byCategory.keys()].filter(
      (key) =>
        key === "other" ||
        !(PLUGIN_CATEGORIES as readonly string[]).includes(key)
    ),
  ];
  const seen = new Set<string>();
  for (const category of categoryKeys) {
    if (seen.has(category)) {
      continue;
    }
    seen.add(category);
    const group = byCategory.get(category);
    if (!group?.length) {
      continue;
    }
    out.push({
      to: "",
      label: t(`settings.categories.${category}`),
      type: "heading",
    });
    for (const item of group) {
      out.push(mapItem(item));
    }
  }
  return out;
}

function isSecondaryNavLinkChild(child: {
  to: string;
  type?: "link" | "separator" | "heading";
}): boolean {
  return (
    child.type !== "separator" &&
    child.type !== "heading" &&
    isNavigablePath(child.to)
  );
}

/**
 * Apply a tenant-persisted order to the modules rail section. Unknown ids are
 * skipped; modules missing from `order` keep default category order at the end.
 */
export function applyDockModuleOrder(
  sections: NavigationSection[],
  order: string[] | null | undefined
): NavigationSection[] {
  if (!order?.length) {
    return sections;
  }
  return sections.map((section) => {
    if (section.id !== "modules") {
      return section;
    }
    const byId = new Map<string, NavigationItem>();
    for (const item of section.items) {
      if (item.id) {
        byId.set(item.id, item);
      }
    }
    const ordered: NavigationItem[] = [];
    const seen = new Set<string>();
    for (const id of order) {
      const item = byId.get(id);
      if (!item || seen.has(id)) {
        continue;
      }
      ordered.push(item);
      seen.add(id);
    }
    for (const item of section.items) {
      if (!item.id) {
        ordered.push(item);
        continue;
      }
      if (seen.has(item.id)) {
        continue;
      }
      ordered.push(item);
      seen.add(item.id);
    }
    return { ...section, items: ordered };
  });
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
    // Personal connections live at /setup/connections; members have no Setup
    // rail, so keep them in the Settings secondary nav.
    if (
      currentPath === "/setup/connections" ||
      currentPath.startsWith("/setup/connections/")
    ) {
      const settingsItem = flattenItems(sections).find(
        (i) => i.to === "/settings"
      );
      if (settingsItem?.children && settingsItem.children.length > 0) {
        return settingsItem.children;
      }
    }
  }

  return null;
}
