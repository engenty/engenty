import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { Wrench } from "lucide-react";
import { useMemo } from "react";
import { useShellSecondaryNav } from "../../context/shell-secondary-nav-context.js";
import { ModuleSidebarHeaderLabel } from "./module-sidebar-header-label.js";

const SETUP_BASE = "/setup";

/**
 * Shared sidebar header + breadcrumb suppression for `/setup/*` pages.
 *
 * Same pattern as `useSettingsSecondaryShellNav`: renders the "Setup" label +
 * icon in the pinned sidebar header slot and conditionally suppresses the root
 * breadcrumb segment when the sidebar is open.
 */
export function useSetupSecondaryShellNav(label: string) {
  const { secondaryNavOpen } = useShellSecondaryNav();

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel icon={Wrench} label={label} to={SETUP_BASE} />
    ),
    [label]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () => (secondaryNavOpen ? null : { label, to: SETUP_BASE }),
    [secondaryNavOpen, label]
  );

  return { moduleRootCrumb, secondaryNavHeaderSlot };
}
