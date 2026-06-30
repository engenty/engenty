import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  SidebarMenu,
  SidebarRow,
  SidebarRowButton,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { Bot, Network, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  isTeamSettingsPath,
  TEAM_AGENTS_PATH,
  TEAM_GRAPH_PATH,
  TEAM_MODULE_BASE,
} from "../team-paths.js";

function TeamSidebarNavRow({
  active,
  icon: Icon,
  label,
  to,
}: {
  active: boolean;
  icon: typeof Users;
  label: string;
  to: string;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

export function TeamSidebarChrome() {
  const { t } = useTranslation("team");
  const { pathname } = useLocation();

  const isTeam =
    pathname === TEAM_MODULE_BASE ||
    (pathname.startsWith(`${TEAM_MODULE_BASE}/`) &&
      !pathname.startsWith(TEAM_AGENTS_PATH) &&
      !pathname.startsWith(TEAM_GRAPH_PATH) &&
      !isTeamSettingsPath(pathname));
  const isAgents = pathname.startsWith(TEAM_AGENTS_PATH);
  const isGraph = pathname.startsWith(TEAM_GRAPH_PATH);

  return (
    <nav
      aria-label={t("sidebar.module_nav_aria")}
      className={`pt-2 ${sidebarColumnContentInsetClassName}`}
    >
      <SidebarMenu className="gap-0.5">
        <TeamSidebarNavRow
          active={isTeam}
          icon={Users}
          label={t("sidebar.nav_team")}
          to={TEAM_MODULE_BASE}
        />
        <TeamSidebarNavRow
          active={isAgents}
          icon={Bot}
          label={t("sidebar.nav_agents")}
          to={TEAM_AGENTS_PATH}
        />
        <TeamSidebarNavRow
          active={isGraph}
          icon={Network}
          label={t("sidebar.nav_graph")}
          to={TEAM_GRAPH_PATH}
        />
      </SidebarMenu>
    </nav>
  );
}
