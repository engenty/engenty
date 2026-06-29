import { ScrollArea } from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  AiAgentEntry,
  AiRegisteredAction,
  AiSkillRecord,
} from "../../lib/admin/ai-runtime-api";
import { useAdminAiSessionsQuery } from "../../lib/admin/ai-runtime-queries";
import { useAdminAgentsSidebarNavPersistence } from "./admin-agents-sidebar-nav-queries";
import { parseAgentSessionDetailFromPathname } from "./agent-workspace-url-state";
import { getSkillModuleId } from "./skill-record-utils";
import { SkillCatalogSidebarPanel } from "./skills-catalog-view";
import { useWorkspaceNavKeyboard } from "./use-workspace-nav-keyboard";
import type { CatalogModuleFolder } from "./workspace-catalog-partition";
import { partitionCatalogByCoreModule } from "./workspace-catalog-partition";
import { WorkspaceNavAgentsPanel } from "./workspace-nav-agents-panel";
import { WorkspaceNavSessionsPanel } from "./workspace-nav-sessions-panel";
import { WorkspaceNavTabHeader } from "./workspace-nav-tab-header";
import {
  catalogQueryMatches,
  TENANT_ACTIONS_FOLDER_ID,
  TENANT_SKILLS_FOLDER_ID,
  type WorkspaceNavPrimaryTab,
  workspaceNavPrimaryTabFromPathname,
} from "./workspace-nav-utils";

interface EngentyWorkspaceNavProps {
  actions: AiRegisteredAction[];
  actionsEmptyLabel: string;
  actionsLoading: boolean;
  agents: AiAgentEntry[];
  /** Desktop: bordered rail. Mobile sheet: full-height panel without fixed width. */
  dock?: "aside" | "panel";
  emptyAgentsLabel: string;
  isLandingPage: boolean;
  onAddAgent?: () => void;
  /** Fires after any navigation selection (e.g. close mobile sheet). */
  onNavigate?: () => void;
  onSelectAction: (actionId: string) => void;
  onSelectActionsList: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectAgentsList: () => void;
  onSelectGlobalActionCapabilities: () => void;
  onSelectGlobalSettings: () => void;
  onSelectSkill: (skillId: string) => void;
  onSelectSkillsList: () => void;
  selectedActionId?: string;
  selectedAgentId: string;
  selectedSkillId?: string;
  skills: AiSkillRecord[];
  skillsEmptyLabel: string;
  skillsLoading: boolean;
  t: (key: string) => string;
}

export function EngentyWorkspaceNav({
  actions,
  actionsEmptyLabel,
  actionsLoading,
  agents,
  dock = "aside",
  emptyAgentsLabel,
  isLandingPage,
  onAddAgent,
  onNavigate,
  onSelectAction,
  onSelectActionsList,
  onSelectAgent,
  onSelectAgentsList,
  onSelectGlobalActionCapabilities,
  onSelectGlobalSettings,
  onSelectSkillsList,
  onSelectSkill,
  selectedAgentId,
  selectedActionId = "",
  selectedSkillId = "",
  skills,
  skillsEmptyLabel,
  skillsLoading,
  t,
}: EngentyWorkspaceNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const runNav = useCallback(
    (fn: () => void) => {
      fn();
      onNavigate?.();
    },
    [onNavigate]
  );

  const {
    actionsOpen,
    agentsOpen,
    isFolderOpen,
    pinAgent,
    pinnedAgents,
    setActionsOpen,
    setAgentsOpen,
    setSkillsOpen,
    skillsOpen,
    toggleFolder,
    unpinAgent,
  } = useAdminAgentsSidebarNavPersistence();

  const skillsPartition = useMemo(() => {
    const normalizedSkills = skills.map((skill) => ({
      ...skill,
      module_id: getSkillModuleId(skill),
    }));
    const tenantSkills = normalizedSkills
      .filter((skill) => skill.source_kind === "user")
      .toSorted((left, right) => left.name.localeCompare(right.name));
    const nonTenantSkills = normalizedSkills.filter(
      (skill) => skill.source_kind !== "user"
    );
    const partitioned = partitionCatalogByCoreModule(nonTenantSkills);
    return tenantSkills.length > 0
      ? {
          folders: [
            {
              items: tenantSkills,
              moduleId: TENANT_SKILLS_FOLDER_ID,
            },
            ...partitioned.folders,
          ],
          root: partitioned.root,
        }
      : partitioned;
  }, [skills]);
  const actionsPartition = useMemo(() => {
    const tenantActions = actions
      .filter((action) => action.source_kind === "user")
      .toSorted((left, right) => left.name.localeCompare(right.name));
    const nonTenantActions = actions.filter(
      (action) => action.source_kind !== "user"
    );
    const partitioned = partitionCatalogByCoreModule(nonTenantActions);
    return tenantActions.length > 0
      ? {
          folders: [
            {
              items: tenantActions,
              moduleId: TENANT_ACTIONS_FOLDER_ID,
            },
            ...partitioned.folders,
          ],
          root: partitioned.root,
        }
      : partitioned;
  }, [actions]);

  const [primaryTab, setPrimaryTab] = useState<WorkspaceNavPrimaryTab>(() =>
    workspaceNavPrimaryTabFromPathname(location.pathname)
  );
  useEffect(() => {
    setPrimaryTab(workspaceNavPrimaryTabFromPathname(location.pathname));
  }, [location.pathname]);

  const [agentsCatalogSearch, setAgentsCatalogSearch] = useState("");
  const [sessionsCatalogSearch, setSessionsCatalogSearch] = useState("");

  const agentsQueryRaw =
    primaryTab === "agents" ? agentsCatalogSearch.trim() : "";
  const catalogSearchLower = agentsQueryRaw.toLowerCase();
  const catalogSearchActive = catalogSearchLower.length > 0;

  const sessionsQueryRaw =
    primaryTab === "sessions" ? sessionsCatalogSearch.trim() : "";
  const sessionsSearchLower = sessionsQueryRaw.toLowerCase();
  const sessionsSearchActive = sessionsSearchLower.length > 0;

  const resolveSkillFolderLabel = useCallback(
    (folder: CatalogModuleFolder<AiSkillRecord>) =>
      folder.moduleId === TENANT_SKILLS_FOLDER_ID
        ? t("skills.origin.tenant")
        : folder.moduleId,
    [t]
  );

  const resolveActionFolderLabel = useCallback(
    (folder: CatalogModuleFolder<AiRegisteredAction>) =>
      folder.moduleId === TENANT_ACTIONS_FOLDER_ID
        ? t("skills.origin.tenant")
        : folder.moduleId,
    [t]
  );

  const filteredAgents = useMemo(() => {
    if (!catalogSearchActive) {
      return agents;
    }
    return agents.filter((agent) =>
      catalogQueryMatches(agent.name, catalogSearchLower)
    );
  }, [agents, catalogSearchActive, catalogSearchLower]);

  const pinnedAgentIdSet = useMemo(() => new Set(pinnedAgents), [pinnedAgents]);

  const agentById = useMemo(() => {
    const map = new Map<string, AiAgentEntry>();
    for (const agent of agents) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  const pinnedAgentsOrdered = useMemo(() => {
    const list: AiAgentEntry[] = [];
    for (const id of pinnedAgents) {
      const entry = agentById.get(id);
      if (entry) {
        list.push(entry);
      }
    }
    return list;
  }, [agentById, pinnedAgents]);

  const pinnedAgentsVisible = useMemo(() => {
    if (!catalogSearchActive) {
      return pinnedAgentsOrdered;
    }
    const allowed = new Set(filteredAgents.map((a) => a.id));
    return pinnedAgentsOrdered.filter((a) => allowed.has(a.id));
  }, [catalogSearchActive, filteredAgents, pinnedAgentsOrdered]);

  const unpinnedFilteredAgents = useMemo(
    () => filteredAgents.filter((a) => !pinnedAgentIdSet.has(a.id)),
    [filteredAgents, pinnedAgentIdSet]
  );

  const filteredSkillsPartition = useMemo(() => {
    if (!catalogSearchActive) {
      return skillsPartition;
    }
    const q = catalogSearchLower;
    const skillMatches = (skill: AiSkillRecord) => {
      const display = skill.title?.trim() || skill.name;
      return (
        catalogQueryMatches(display, q) || catalogQueryMatches(skill.name, q)
      );
    };
    const root = skillsPartition.root.filter(skillMatches);
    const folders = skillsPartition.folders
      .map((folder) => {
        if (catalogQueryMatches(resolveSkillFolderLabel(folder), q)) {
          return folder;
        }
        return {
          ...folder,
          items: folder.items.filter(skillMatches),
        };
      })
      .filter((folder) => folder.items.length > 0);
    return { folders, root };
  }, [
    catalogSearchActive,
    catalogSearchLower,
    resolveSkillFolderLabel,
    skillsPartition,
  ]);

  const filteredActionsPartition = useMemo(() => {
    if (!catalogSearchActive) {
      return actionsPartition;
    }
    const q = catalogSearchLower;
    const actionMatches = (action: AiRegisteredAction) =>
      catalogQueryMatches(action.name, q);
    const root = actionsPartition.root.filter(actionMatches);
    const folders = actionsPartition.folders
      .map((folder) => {
        if (catalogQueryMatches(resolveActionFolderLabel(folder), q)) {
          return folder;
        }
        return {
          ...folder,
          items: folder.items.filter(actionMatches),
        };
      })
      .filter((folder) => folder.items.length > 0);
    return { folders, root };
  }, [
    actionsPartition,
    catalogSearchActive,
    catalogSearchLower,
    resolveActionFolderLabel,
  ]);

  const skillsCatalogHasRows = useMemo(
    () =>
      skillsPartition.root.length > 0 ||
      skillsPartition.folders.some((f) => f.items.length > 0),
    [skillsPartition.folders, skillsPartition.root]
  );

  const actionsCatalogHasRows = useMemo(
    () =>
      actionsPartition.root.length > 0 ||
      actionsPartition.folders.some((f) => f.items.length > 0),
    [actionsPartition.folders, actionsPartition.root]
  );

  const actionsListEmptyLabel =
    catalogSearchActive &&
    actionsCatalogHasRows &&
    !actionsLoading &&
    filteredActionsPartition.root.length === 0 &&
    filteredActionsPartition.folders.length === 0
      ? t("workspace.sidebarCatalogSearchEmpty")
      : actionsEmptyLabel;

  const navRootRef = useRef<HTMLDivElement>(null);
  const onNavKeyDown = useWorkspaceNavKeyboard(navRootRef, null);

  const sessionsNavLabel = t("sessionsCatalog.navLabel");

  const adminSessionsQuery = useAdminAiSessionsQuery(
    null,
    primaryTab === "sessions"
  );

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) {
      map.set(agent.id, agent.name);
    }
    return map;
  }, [agents]);

  const routeActiveSessionId = useMemo(
    () => parseAgentSessionDetailFromPathname(location.pathname)?.threadId,
    [location.pathname]
  );

  const tenantSessionsRaw = adminSessionsQuery.data?.sessions ?? [];

  const sidebarSessions = useMemo(() => {
    if (!sessionsSearchActive) {
      return tenantSessionsRaw;
    }
    const q = sessionsSearchLower;
    return tenantSessionsRaw.filter((row) => {
      const label = (
        row.title?.trim() ||
        row.summary?.trim() ||
        row.id
      ).toLowerCase();
      if (label.includes(q)) {
        return true;
      }
      if (row.id.toLowerCase().includes(q)) {
        return true;
      }
      if (row.user_id?.toLowerCase().includes(q)) {
        return true;
      }
      const aid = row.current_agent_id;
      if (aid) {
        if (aid.toLowerCase().includes(q)) {
          return true;
        }
        const agentName = (agentNameById.get(aid) ?? "").toLowerCase();
        if (agentName.includes(q)) {
          return true;
        }
      }
      return false;
    });
  }, [
    agentNameById,
    sessionsSearchActive,
    sessionsSearchLower,
    tenantSessionsRaw,
  ]);

  const sessionsCatalogHasRows = tenantSessionsRaw.length > 0;
  const sidebarSessionsSearchEmpty =
    sessionsSearchActive &&
    sessionsCatalogHasRows &&
    !adminSessionsQuery.isLoading &&
    sidebarSessions.length === 0
      ? t("workspace.sidebarCatalogSearchEmpty")
      : null;

  const sessionsNavRowMatchesSearch =
    !sessionsSearchActive ||
    catalogQueryMatches(sessionsNavLabel, sessionsSearchLower);
  /** Keep the sessions tab usable when the query matches session rows but not the "All sessions" label. */
  const sessionsPanelVisible =
    sessionsNavRowMatchesSearch ||
    adminSessionsQuery.isLoading ||
    tenantSessionsRaw.length > 0;

  const sidebarTabHeader = (
    <WorkspaceNavTabHeader
      agentsCatalogSearch={agentsCatalogSearch}
      onAgentsCatalogSearchChange={setAgentsCatalogSearch}
      onPrimaryTabChange={setPrimaryTab}
      onSessionsCatalogSearchChange={setSessionsCatalogSearch}
      primaryTab={primaryTab}
      sessionsCatalogSearch={sessionsCatalogSearch}
      t={t}
    />
  );

  const agentsTree = (
    <WorkspaceNavAgentsPanel
      actions={actions}
      actionsListEmptyLabel={actionsListEmptyLabel}
      actionsLoading={actionsLoading}
      actionsOpen={actionsOpen}
      agents={agents}
      agentsOpen={agentsOpen}
      catalogSearchActive={catalogSearchActive}
      emptyAgentsLabel={emptyAgentsLabel}
      filteredActionsPartition={filteredActionsPartition}
      filteredAgents={filteredAgents}
      isFolderOpen={isFolderOpen}
      isLandingPage={isLandingPage}
      navRootRef={navRootRef}
      onAddAgent={onAddAgent}
      onNavKeyDown={onNavKeyDown}
      onSelectAction={onSelectAction}
      onSelectActionsList={onSelectActionsList}
      onSelectAgent={onSelectAgent}
      onSelectAgentsList={onSelectAgentsList}
      pinAgent={pinAgent}
      pinnedAgentsVisible={pinnedAgentsVisible}
      runNav={runNav}
      selectedActionId={selectedActionId}
      selectedAgentId={selectedAgentId}
      setActionsOpen={setActionsOpen}
      setAgentsOpen={setAgentsOpen}
      t={t}
      toggleFolder={toggleFolder}
      unpinAgent={unpinAgent}
      unpinnedFilteredAgents={unpinnedFilteredAgents}
    />
  );

  const sessionsPanel = (
    <WorkspaceNavSessionsPanel
      adminSessionsQuery={adminSessionsQuery}
      agentNameById={agentNameById}
      routeActiveSessionId={routeActiveSessionId}
      runNav={runNav}
      sessionsNavLabel={sessionsNavLabel}
      sessionsNavRowMatchesSearch={sessionsNavRowMatchesSearch}
      sessionsPanelVisible={sessionsPanelVisible}
      sessionsSearchActive={sessionsSearchActive}
      sidebarSessions={sidebarSessions}
      sidebarSessionsSearchEmpty={sidebarSessionsSearchEmpty}
      t={t}
      tenantSessionsRaw={tenantSessionsRaw}
    />
  );

  const skillsPanel = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SkillCatalogSidebarPanel
        loading={skillsLoading}
        onSelectSkill={(skillName) => runNav(() => onSelectSkill(skillName))}
        selectedSkillId={selectedSkillId ?? ""}
        skills={skills}
      />
    </div>
  );

  const scrollBody =
    primaryTab === "skills" ? (
      skillsPanel
    ) : (
      <ScrollArea className="min-h-0 flex-1">
        {primaryTab === "agents" ? agentsTree : null}
        {primaryTab === "sessions" ? sessionsPanel : null}
      </ScrollArea>
    );

  if (dock === "panel") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {sidebarTabHeader}
        {scrollBody}
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col">
      {sidebarTabHeader}
      {scrollBody}
    </aside>
  );
}
