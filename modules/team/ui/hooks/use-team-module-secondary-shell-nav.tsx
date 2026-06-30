import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DockTeamMembersIcon } from "@engenty/ui-core";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { TeamSidebarPanel } from "../components/team-sidebar-panel.js";
import { TEAM_MODULE_BASE } from "../team-paths.js";

/** Unified sidebar panel for any `/mdl/team/*` screen. */
export function useTeamModuleSecondaryShellNav() {
  const { t, i18n, ready } = useTranslation("team");
  const { secondaryNavOpen } = useShellSecondaryNav();

  const secondaryNavAfterItems = useMemo(
    () => <TeamSidebarPanel />,
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={DockTeamMembersIcon}
        label={t("menu")}
        to={TEAM_MODULE_BASE}
      />
    ),
    [t]
  );

  /**
   * First breadcrumb segment — module label when sidebar is closed.
   * When pinned open the label is already visible in the header slot,
   * so we suppress it from the breadcrumb to avoid doubling.
   */
  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen ? null : { label: t("menu"), to: TEAM_MODULE_BASE },
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
