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
  type LucideIcon,
  MessagesSquare,
  Workflow,
  Wrench,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import type {
  AiAgentEntry,
  AiSkillRecord,
} from "../../lib/admin/ai-runtime-api.js";
import { useAdminAiThreadsQuery } from "../../lib/admin/ai-runtime-queries.js";
import type { WorkflowCatalogEntry } from "../workflow-canvas/workflow-flows-state.js";
import { useAdminAgentsSidebarNavPersistence } from "./admin-agents-sidebar-nav-queries.js";
import {
  buildActivityPath,
  buildAgentsCatalogPath,
  buildAgentsWorkspacePath,
  buildArtifactsPath,
  buildConnectionsPath,
  buildSkillsCatalogPath,
  buildToolsPath,
  buildWorkflowsCatalogPath,
  parseAgentSessionDetailFromPathname,
} from "./agent-workspace-url-state.js";
import { AgentsWorkspaceAgentsPanel } from "./agents-workspace-agents-panel.js";
import { AgentsWorkspaceConnectionsPanel } from "./agents-workspace-connections-panel.js";
import { AgentsWorkspaceFlowsPanel } from "./agents-workspace-flows-panel.js";
import { AgentsWorkspaceThreadsPanel } from "./agents-workspace-threads-panel.js";
import { SkillCatalogSidebarPanel } from "./skills-catalog-view.js";
import { useAgentsWorkspaceSidebarState } from "./use-agents-workspace-sidebar-state.js";
import type { WorkspaceNavPrimaryTab } from "./workspace-nav-utils.js";

export interface AgentsWorkspaceSidebarProps {
  agents: AiAgentEntry[];
  flows: WorkflowCatalogEntry[];
  flowsLoading: boolean;
  isLandingPage?: boolean;
  onNavigate?: () => void;
  onSelectAgent: (id: string) => void;
  onSelectFlow: (flow: WorkflowCatalogEntry) => void;
  onSelectSkill: (name: string) => void;
  selectedAgentId: string;
  selectedFlowId?: string;
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
  Icon: LucideIcon;
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
  agents,
  flows,
  flowsLoading,
  isLandingPage = false,
  onNavigate,
  onSelectAgent,
  onSelectFlow,
  onSelectSkill,
  selectedAgentId,
  selectedFlowId = "",
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

  const threadsQuery = useAdminAiThreadsQuery(null, primaryTab === "sessions");
  const threadsRaw = threadsQuery.data?.sessions ?? [];

  const agentNameById = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name])),
    [agents]
  );
  const routeActiveThreadId = parseAgentSessionDetailFromPathname(
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
              Icon={Workflow}
              pathname={location.pathname}
              search={location.search}
              to={buildWorkflowsCatalogPath()}
            >
              {t("workspace.sidebarFlows", { defaultValue: "Actions" })}
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
          </SidebarNavList>
          {/* The five building blocks above are the control plane. What follows
              is everything that has a home of its own in the target model
              (Activity → Work, Artifacts → Spaces, Connections → Tools) and is
              parked here until that fold-in happens. */}
          <SidebarNavList>
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
          <SidebarTab value="flows">{t("workspace.sidebarFlows")}</SidebarTab>
          <SidebarTab value="skills">{t("workspace.sidebarSkills")}</SidebarTab>
          <SidebarTab value="sessions">
            {t("workspace.sidebarSessions")}
          </SidebarTab>
          <SidebarTab value="connections">
            {t("workspace.sidebarConnections")}
          </SidebarTab>
        </SidebarTabStrip>
      </SidebarHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {primaryTab === "skills" ? (
          <SkillCatalogSidebarPanel
            loading={skillsLoading}
            onSelectSkill={(name) => runNav(() => onSelectSkill(name))}
            selectedSkillId={selectedSkillId}
            skills={skills}
          />
        ) : primaryTab === "flows" ? (
          <AgentsWorkspaceFlowsPanel
            flows={flows}
            flowsLoading={flowsLoading}
            onSelectFlow={(flow) => runNav(() => onSelectFlow(flow))}
            selectedFlowId={selectedFlowId}
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
                <AgentsWorkspaceThreadsPanel
                  agentNameById={agentNameById}
                  isError={threadsQuery.isError}
                  isLoading={threadsQuery.isLoading}
                  routeActiveThreadId={routeActiveThreadId}
                  runNav={runNav}
                  searchActive={false}
                  threads={threadsRaw}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        )}
      </div>
    </aside>
  );
}
