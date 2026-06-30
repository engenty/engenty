import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DockProjectsIcon } from "@engenty/ui-core";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { ProjectsSidebarPanel } from "../components/projects-sidebar-panel.js";

const PROJECTS_BASE = "/mdl/projects";

/** Unified sidebar panel for any `/mdl/projects/*` screen. */
export function useProjectsModuleSecondaryShellNav() {
  const { i18n, ready, t } = useTranslation("projects");
  const { secondaryNavOpen } = useShellSecondaryNav();

  const secondaryNavAfterItems = useMemo(
    () => <ProjectsSidebarPanel />,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={DockProjectsIcon}
        label={t("menu.projects")}
        to={PROJECTS_BASE}
      />
    ),
    [t]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen
        ? null
        : { label: t("menu.projects"), to: PROJECTS_BASE },
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
