/**
 * AgentsWorkspaceSidebar — registered as secondaryNavAfterItems via
 * useAgentsWorkspaceShellNav. Follows the exact SessionList / KbSidebar
 * structure: aside > SidebarHeader (tabs + nav) > SidebarContent (body).
 * Each tab panel owns its own search input.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { matchesPath } from "@engenty/app-shell/navigation";
import { useTranslation } from "@engenty/i18n/ui";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarNavList,
  SidebarRow,
  SidebarRowButton,
  SidebarTab,
  SidebarTabStrip,
} from "@engenty/ui-core";
import {
  Bot,
  Cable,
  FileStack,
  FileTerminal,
  House,
  ListChecks,
  MessagesSquare,
  Wrench,
} from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";
import { Link, useLocation } from "react-router-dom";
import type {
  AiAgentEntry,
  AiRegisteredAction,
  AiSkillRecord,
} from "../../lib/admin/ai-runtime-api";
import { useAdminAiSessionsQuery } from "../../lib/admin/ai-runtime-queries";
import { useAdminAgentsSidebarNavPersistence } from "./admin-agents-sidebar-nav-queries";
import {
  buildActionsCatalogPath,
  buildActivityPath,
  buildAgentsCatalogPath,
  buildAgentsWorkspacePath,
  buildArtifactsPath,
  buildConnectionsPath,
  buildSkillsCatalogPath,
  buildToolsPath,
  parseAgentSessionDetailFromPathname,
} from "./agent-workspace-url-state";
import { AgentsWorkspaceActionsPanel } from "./agents-workspace-actions-panel";
import { AgentsWorkspaceAgentsPanel } from "./agents-workspace-agents-panel";
import { AgentsWorkspaceConnectionsPanel } from "./agents-workspace-connections-panel";
import { AgentsWorkspaceSessionsPanel } from "./agents-workspace-sessions-panel";
import { SkillCatalogSidebarPanel } from "./skills-catalog-view";
import { useAgentsWorkspaceSidebarState } from "./use-agents-workspace-sidebar-state";
import type { WorkspaceNavPrimaryTab } from "./workspace-nav-utils";

export interface AgentsWorkspaceSidebarProps {
  actions: AiRegisteredAction[];
  actionsLoading: boolean;
  agents: AiAgentEntry[];
  isLandingPage?: boolean;
  onNavigate?: () => void;
  onSelectAction: (id: string) => void;
  onSelectAgent: (id: string) => void;
  onSelectSkill: (name: string) => void;
  selectedActionId?: string;
  selectedAgentId: string;
  selectedSkillId?: string;
  skills: AiSkillRecord[];
  skillsLoading: boolean;
}

function WorkspaceNavLinkRow({
  pathname,
  search,
  to,
  Icon,
  children,
}: {
  pathname: string;
  search: string;
  to: string;
  Icon: ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  children: ReactNode;
}) {
  const isActive = matchesPath(pathname, search, to);
  return (
    <SidebarRow isActive={isActive}>
      <SidebarRowButton asChild isActive={isActive}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{children}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

export function AgentsWorkspaceSidebar({
  actions,
  actionsLoading,
  agents,
  isLandingPage = false,
  onNavigate,
  onSelectAction,
  onSelectAgent,
  onSelectSkill,
  selectedActionId = "",
  selectedAgentId,
  selectedSkillId = "",
  skills,
  skillsLoading,
}: AgentsWorkspaceSidebarProps) {
  const { t } = useTranslation("ai-ui");
  const location = useLocation();

  const { primaryTab, setPrimaryTab } = useAgentsWorkspaceSidebarState(
    location.pathname
  );

  const { pinnedAgents, pinAgent, unpinAgent } =
    useAdminAgentsSidebarNavPersistence();

  const sessionsQuery = useAdminAiSessionsQuery(
    null,
    primaryTab === "sessions"
  );
  const sessionsRaw = sessionsQuery.data?.sessions ?? [];

  const agentNameById = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name])),
    [agents]
  );
  const routeActiveSessionId = parseAgentSessionDetailFromPathname(
    location.pathname
  )?.threadId;

  const runNav = useCallback(
    (fn: () => void) => {
      fn();
      onNavigate?.();
    },
    [onNavigate]
  );

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-0 bg-transparent shadow-none">
      <SidebarHeader className="gap-0 p-0">
        {/* Module-level home nav links */}
        <nav aria-label={t("workspace.sidebarNavAriaLabel")} className="pt-2">
          <SidebarNavList>
            <WorkspaceNavLinkRow
              Icon={House}
              pathname={location.pathname}
              search={location.search}
              to={buildAgentsWorkspacePath()}
            >
              {t("workspace.sidebarNavHome")}
            </WorkspaceNavLinkRow>
            <WorkspaceNavLinkRow
              Icon={Bot}
              pathname={location.pathname}
              search={location.search}
              to={buildAgentsCatalogPath()}
            >
              {t("workspace.sidebarAgents")}
            </WorkspaceNavLinkRow>
            <WorkspaceNavLinkRow
              Icon={ListChecks}
              pathname={location.pathname}
              search={location.search}
              to={buildActionsCatalogPath()}
            >
              {t("workspace.sidebarActions")}
            </WorkspaceNavLinkRow>
            <WorkspaceNavLinkRow
              Icon={FileTerminal}
              pathname={location.pathname}
              search={location.search}
              to={buildSkillsCatalogPath()}
            >
              {t("workspace.sidebarSkills")}
            </WorkspaceNavLinkRow>
            <WorkspaceNavLinkRow
              Icon={Wrench}
              pathname={location.pathname}
              search={location.search}
              to={buildToolsPath()}
            >
              {t("workspace.sidebarTools")}
            </WorkspaceNavLinkRow>
            <WorkspaceNavLinkRow
              Icon={FileStack}
              pathname={location.pathname}
              search={location.search}
              to={buildArtifactsPath()}
            >
              {t("workspace.sidebarArtifacts")}
            </WorkspaceNavLinkRow>
            <WorkspaceNavLinkRow
              Icon={Cable}
              pathname={location.pathname}
              search={location.search}
              to={buildConnectionsPath()}
            >
              {t("workspace.sidebarConnections")}
            </WorkspaceNavLinkRow>
            <WorkspaceNavLinkRow
              Icon={MessagesSquare}
              pathname={location.pathname}
              search={location.search}
              to={buildActivityPath()}
            >
              {t("workspace.sidebarActivity")}
            </WorkspaceNavLinkRow>
          </SidebarNavList>
        </nav>

        <SidebarTabStrip
          onValueChange={(v) => setPrimaryTab(v as WorkspaceNavPrimaryTab)}
          value={primaryTab}
        >
          <SidebarTab value="agents">{t("workspace.sidebarAgents")}</SidebarTab>
          <SidebarTab value="actions">
            {t("workspace.sidebarActions")}
          </SidebarTab>
          <SidebarTab value="skills">{t("workspace.sidebarSkills")}</SidebarTab>
          <SidebarTab value="sessions">
            {t("workspace.sidebarSessions")}
          </SidebarTab>
          <SidebarTab value="connections">
            {t("workspace.sidebarConnections")}
          </SidebarTab>
        </SidebarTabStrip>
      </SidebarHeader>

      {primaryTab === "skills" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SkillCatalogSidebarPanel
            loading={skillsLoading}
            onSelectSkill={(name) => runNav(() => onSelectSkill(name))}
            selectedSkillId={selectedSkillId}
            skills={skills}
          />
        </div>
      ) : primaryTab === "actions" ? (
        <AgentsWorkspaceActionsPanel
          actions={actions}
          actionsLoading={actionsLoading}
          onSelectAction={(id) => runNav(() => onSelectAction(id))}
          selectedActionId={selectedActionId}
        />
      ) : primaryTab === "connections" ? (
        <AgentsWorkspaceConnectionsPanel runNav={runNav} />
      ) : primaryTab === "agents" ? (
        <AgentsWorkspaceAgentsPanel
          agents={agents}
          isLandingPage={isLandingPage}
          onSelectAgent={(id) => runNav(() => onSelectAgent(id))}
          pinAgent={pinAgent}
          pinnedAgents={pinnedAgents}
          runNav={runNav}
          selectedAgentId={selectedAgentId}
          unpinAgent={unpinAgent}
        />
      ) : (
        <SidebarContent className="px-0 py-0">
          <SidebarGroup className="p-0 pb-2">
            <SidebarGroupContent>
              <AgentsWorkspaceSessionsPanel
                agentNameById={agentNameById}
                isError={sessionsQuery.isError}
                isLoading={sessionsQuery.isLoading}
                routeActiveSessionId={routeActiveSessionId}
                runNav={runNav}
                searchActive={false}
                sessions={sessionsRaw}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      )}
    </aside>
  );
}
