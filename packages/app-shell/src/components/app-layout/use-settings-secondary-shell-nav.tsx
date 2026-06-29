import { DockSettingsIcon } from "@engenty/ui-core";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useShellSecondaryNav } from "../../context/shell-secondary-nav-context.js";
import { ModuleSidebarHeaderLabel } from "./module-sidebar-header-label.js";

const SETTINGS_BASE = "/settings";

/**
 * Shared sidebar header + breadcrumb suppression for `/settings/*` pages.
 *
 * Same pattern as the per-module `use-*-module-secondary-shell-nav` hooks:
 * renders the "Settings" label + icon in the pinned sidebar header slot and
 * conditionally suppresses the root breadcrumb segment when the sidebar is open.
 */
export function useSettingsSecondaryShellNav(label: string) {
  const { secondaryNavOpen } = useShellSecondaryNav();

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={DockSettingsIcon}
        label={label}
        to={SETTINGS_BASE}
      />
    ),
    [label]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () => (secondaryNavOpen ? null : { label, to: SETTINGS_BASE }),
    [secondaryNavOpen, label]
  );

  return { moduleRootCrumb, secondaryNavHeaderSlot };
}
