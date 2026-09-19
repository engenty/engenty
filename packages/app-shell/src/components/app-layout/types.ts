import type {
  PageBreadcrumb,
  WorkspaceSpace,
  WorkspaceTenant,
} from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";
import type { NavigationSection, ShellSidebarConfig } from "../../types/shell";
import type { ShellAppBarPositionPersistence } from "../../types/shell-app-bar-position";
import type { ShellSecondaryNavPinnedPersistence } from "../../types/shell-secondary-nav-pinned";
import type { AppMenuActions } from "../app-topbar";

export interface SecondaryNavRouteTransition {
  enterFrom: "left" | "right";
  key: string;
}

export interface AppLayoutProps {
  /** User-settings persistence for desktop app-bar edge. */
  appBarPositionPersistence?: ShellAppBarPositionPersistence;
  /** Quick-action callbacks for the ⌘K command menu. */
  appMenuActions?: AppMenuActions;
  children: ReactNode;
  /** The space the user is working in — published to modules via useWorkspaceContext
   * so they can build space-rooted storage prefixes (PLAN-spaces.md). */
  currentSpace?: WorkspaceSpace | null;
  /** Published to modules via useWorkspaceContext. */
  currentTenant?: WorkspaceTenant | null;
  /** Engenty `core.users` id for module API scope (e.g. `@engenty/ai` session headers). */
  currentUserId?: string | null;
  defaultTopbarTitle?: string;
  fetchResolvedFeatureFlags: () => Promise<Record<string, boolean>>;
  /** Published to modules via useWorkspaceContext so they can hide affordances
   * that lead to admin-only routes instead of dead-ending non-admins. */
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
  /** Tenant admins can drag-reorder modules-rail icons. */
  modulesReorderable?: boolean;
  /** Persist modules-rail order (contribution ids) to tenant-settings. */
  onModulesReorder?: (orderedIds: string[]) => void;
  /**
   * Rendered in the app rail immediately above the personal avatar — the
   * notification bell. Passed in for the same reason as `spacesZone`: the
   * app owns the data, app-shell stays free of fetching.
   */
  /**
   * Outermost personal-cluster slot on the compact rail — the Copilot blob.
   * Host-wired like `railEndSlot`. Desktop only; omit on the mobile sheet.
   */
  railCopilotSlot?: ReactNode;
  railEndSlot?: ReactNode;
  /**
   * Pinned to the FOOT of the secondary column — the space's Settings link.
   * Route-level like the others, and outside the level transition: it is the
   * column's own furniture, not part of what slides.
   */
  secondaryNavFooterSlot?: ReactNode;
  /**
   * Replaces the page's `secondaryNavHeaderSlot` in the secondary column header.
   *
   * Settings / Setup still name the column here. A space uses it for a
   * non-clickable name at every level — Work/Data/Plan and inside a module —
   * so the column keeps naming the space while the back-row sits below.
   */
  secondaryNavHeaderOverride?: ReactNode;
  /**
   * Rendered at the TOP of the secondary column body, above both the shell's
   * static links and the page's `secondaryNavAfterItems`.
   *
   * This is how a space gets one column with two levels in it rather than two
   * columns: the space's Work/Data/Plan tabs sit here, and the module opened
   * under them contributes its own nav directly below through the ordinary
   * page-config slot. No module changes, and no surface ever shows two sidebars.
   *
   * Both slots are route-level facts rather than page ones, deliberately.
   * `usePageConfig` is last-writer-wins on one global: a module page rendered
   * inside a space writes its own config on every re-render and would clobber
   * anything the space layout had put there. Passed in rather than derived here
   * so app-shell stays free of route parsing — the same reason `spacesZone` is
   * a prop.
   */
  secondaryNavLeadingSlot?: ReactNode;
  /** User-settings persistence for global module secondary nav pinned open/closed. */
  secondaryNavPersistence?: ShellSecondaryNavPinnedPersistence;
  /**
   * A crumb the route puts ahead of the page's own — the space a module is open
   * in. The topbar shows it only while the secondary column is COLLAPSED: when
   * the column is open the space is already named at the top of it.
   * `label` may be a picker (ReactNode), same as a page breadcrumb.
   */
  secondaryNavRouteBreadcrumb?: PageBreadcrumb | null;
  /**
   * Animate the column body as one piece when the route moves between NAV
   * LEVELS — a space going from its own tabs into a module it contains, and
   * back. `key` re-mounts the body; `enterFrom` says which side the new level
   * slides in from ("right" going deeper, "left" coming back).
   */
  secondaryNavRouteTransition?: SecondaryNavRouteTransition;
  sections: NavigationSection[];
  shell: ShellSidebarConfig;
  /** Copilot / shell UI mounted beside the frame but inside page-header context. */
  shellUiHost?: ReactNode;
  /**
   * Zone ② of the rail (PLAN-spaces.md Phase 5a). Passed in rather than built
   * here: the spaces list, the recency doc and the "new space" dialog all live
   * in the app, and app-shell stays free of data fetching.
   */
  spacesZone?: ReactNode;
}

export type AppLayoutFrameProps = Omit<
  AppLayoutProps,
  | "currentSpace"
  | "currentTenant"
  | "currentUserId"
  | "isSuperAdmin"
  | "isTenantAdmin"
  | "shellUiHost"
>;

export interface SecondaryNavLinkItem {
  external?: boolean;
  icon?: any;
  label: string;
  to: string;
  type?: "link" | "separator" | "heading";
}

export interface ModuleNavHeaderIcon {
  icon: React.ReactElement;
  label: string;
  to: string;
}
