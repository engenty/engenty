import type { UiIconComponent } from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";

export interface ShellTenant {
  id: string;
  name: string;
  slug: string;
}

export interface NavigationItem {
  children?: Array<{
    to: string;
    label: string;
    external?: boolean;
  }>;
  external?: boolean;
  icon: UiIconComponent;
  label: string;
  to: string;
  /** Reactive count badge on the icon — a hook the sidebar calls per item;
   * undefined or 0 hides the badge. */
  useBadgeCount?: () => number | undefined;
}

export interface NavigationSection {
  collapsible?: boolean;
  defaultExpanded?: boolean;
  items: NavigationItem[];
  label?: string;
}

export interface TenantSwitcherConfig {
  availableTenants: ShellTenant[];
  brandLabel: string;
  canSwitchTenant: boolean;
  currentTenant: ShellTenant | null;
  noTenantLabel: string;
  onSwitchTenant: (tenantId: string) => Promise<void>;
  planLabel: string;
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
