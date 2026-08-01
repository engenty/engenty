import type { ReactNode } from "react";
import type { NavigationSection, ShellSidebarConfig } from "../../types/shell";
import type { ShellSecondaryNavPinnedPersistence } from "../../types/shell-secondary-nav-pinned";
import type { AppMenuActions } from "../app-topbar";

export interface AppLayoutProps {
  /** Quick-action callbacks for the ⌘K command menu. */
  appMenuActions?: AppMenuActions;
  children: ReactNode;
  /** Engenty `core.users` id for module API scope (e.g. `@engenty/ai` session headers). */
  currentUserId?: string | null;
  defaultTopbarTitle?: string;
  fetchResolvedFeatureFlags: () => Promise<Record<string, boolean>>;
  /** Tenant admins can drag-reorder modules-rail icons. */
  modulesReorderable?: boolean;
  /** Persist modules-rail order (contribution ids) to tenant-settings. */
  onModulesReorder?: (orderedIds: string[]) => void;
  /** User-settings persistence for global module secondary nav pinned open/closed. */
  secondaryNavPersistence?: ShellSecondaryNavPinnedPersistence;
  sections: NavigationSection[];
  shell: ShellSidebarConfig;
  /** Copilot / shell UI mounted beside the frame but inside page-header context. */
  shellUiHost?: ReactNode;
}

export type AppLayoutFrameProps = Omit<
  AppLayoutProps,
  "currentUserId" | "shellUiHost"
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
