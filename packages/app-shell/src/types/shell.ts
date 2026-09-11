import type { UiIconComponent } from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";

export type NavigationChildType = "link" | "separator" | "heading";

export interface NavigationItem {
  children?: Array<{
    to: string;
    label: string;
    icon?: UiIconComponent;
    external?: boolean;
    type?: NavigationChildType;
  }>;
  external?: boolean;
  icon: UiIconComponent;
  /** Stable contribution id (admin menu / copilot app) for dock reorder. */
  id?: string;
  label: string;
  to: string;
  /** Reactive count badge on the icon — a hook the sidebar calls per item;
   * undefined or 0 hides the badge. */
  useBadgeCount?: () => number | undefined;
}

/** Stable section key for shell layout (independent of i18n labels). */
export type NavigationSectionId = "primary" | "modules" | "admin";

export interface NavigationSection {
  collapsible?: boolean;
  defaultExpanded?: boolean;
  id?: NavigationSectionId;
  items: NavigationItem[];
  label?: string;
}

export interface ShellSidebarConfig {
  appSubtitle: string;
  appTitle: string;
  dockLabelMode?: "none" | "tooltip" | "flyout" | "dock-grow";
  searchPlaceholder: string;
  searchShortcut?: string;
  userMenu: (compact: boolean) => ReactNode;
}
