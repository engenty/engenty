import type { UiIconComponent } from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";

export interface ShellTenant {
  id: string;
  name: string;
  slug: string;
}

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

export interface TenantSwitcherConfig {
  /** Label + handler for the "About" menu item (opens an app-owned modal). */
  aboutLabel?: string;
  /** App version string shown in the switcher header (e.g. "0.1.0"). */
  appVersion?: string;
  availableTenants: ShellTenant[];
  brandLabel: string;
  canSwitchTenant: boolean;
  currentTenant: ShellTenant | null;
  /** Optional brand logo; falls back to the built-in Engenty mark when unset. */
  logoUrl?: string;
  noTenantLabel: string;
  onAboutClick?: () => void;
  onOpenSettings?: () => void;
  onSwitchTenant: (tenantId: string) => Promise<void>;
  planLabel: string;
  /** Label for the "Settings" menu item. */
  settingsLabel?: string;
  switchTenantAriaLabel?: string;
}

export interface ShellSidebarConfig {
  appSubtitle: string;
  appTitle: string;
  dockLabelMode?: "none" | "tooltip" | "flyout" | "dock-grow";
  searchPlaceholder: string;
  searchShortcut?: string;
  tenantSwitcher?: TenantSwitcherConfig;
  userMenu: (compact: boolean) => ReactNode;
}
