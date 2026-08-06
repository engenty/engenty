import { Button } from "@engenty/ui-core";
import { FolderPen, ListChecks, Pin, PinOff } from "lucide-react";
import type { RefObject } from "react";
import type {
  AiAgentEntry,
  AiRegisteredAction,
} from "../../lib/admin/ai-runtime-api";
import type { CatalogModuleFolder } from "./workspace-catalog-partition";
import { WorkspaceCollapsibleSection } from "./workspace-collapsible-section";
import { WorkspaceNavCatalogGroupedList } from "./workspace-nav-catalog-grouped-list";

interface CatalogPartition<T> {
  folders: CatalogModuleFolder<T>[];
  root: T[];
}

import {
  AgentTreeIcon,
  CatalogTreeIcon,
  compactTreeRowClass,
  compactTreeRowClassFlexFill,
  SidebarNewLinkRow,
  TENANT_ACTIONS_FOLDER_ID,
} from "./workspace-nav-utils";

export interface WorkspaceNavAgentsPanelProps {
  actions: AiRegisteredAction[];
  actionsListEmptyLabel: string;
  actionsLoading: boolean;
  actionsOpen: boolean;
  agents: AiAgentEntry[];
  agentsOpen: boolean;
  catalogSearchActive: boolean;
  emptyAgentsLabel: string;
  filteredActionsPartition: CatalogPartition<AiRegisteredAction>;
  filteredAgents: AiAgentEntry[];
  isFolderOpen: (section: "actions" | "skills", moduleId: string) => boolean;
  isLandingPage: boolean;
  navRootRef: RefObject<HTMLDivElement | null>;
  onAddAgent?: () => void;
  onNavKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onSelectAction: (actionId: string) => void;
  onSelectActionsList: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectAgentsList: () => void;
  pinAgent: (agentId: string) => void;
  pinnedAgentsVisible: AiAgentEntry[];
  runNav: (fn: () => void) => void;
  selectedActionId: string;
  selectedAgentId: string;
  setActionsOpen: (open: boolean) => void;
  setAgentsOpen: (open: boolean) => void;
  t: (key: string) => string;
  toggleFolder: (section: "actions" | "skills", moduleId: string) => void;
  unpinAgent: (agentId: string) => void;
  unpinnedFilteredAgents: AiAgentEntry[];
}

export function WorkspaceNavAgentsPanel(props: WorkspaceNavAgentsPanelProps) {
  const {
    actionsListEmptyLabel,
    actionsLoading,
    catalogSearchActive,
    emptyAgentsLabel,
    filteredActionsPartition,
    filteredAgents,
    isFolderOpen,
    isLandingPage,
    navRootRef,
    onAddAgent,
    onNavKeyDown,
    onSelectAction,
    onSelectActionsList,
    onSelectAgent,
    onSelectAgentsList,
    pinnedAgentsVisible,
    runNav,
    selectedActionId,
    selectedAgentId,
    setActionsOpen,
    setAgentsOpen,
    t,
    toggleFolder,
    unpinAgent,
    unpinnedFilteredAgents,
    agents,
    agentsOpen,
    actionsOpen,
    pinAgent,
  } = props;

  return (
    <div
      aria-label={t("workspace.navAriaLabel")}
      className="p-1.5 pb-4"
      onKeyDown={onNavKeyDown}
      ref={navRootRef}
      role="navigation"
    >
      {pinnedAgentsVisible.length > 0 ? (
        <div className="px-1.5 pb-3">
          <p className="px-1 pb-1.5 font-semibold text-muted-foreground text-xs">
            {t("workspace.sidebarPinned")}
          </p>
          <div className="flex flex-col gap-0.5">
            {pinnedAgentsVisible.map((agent) => {
              const isActive = !isLandingPage && agent.id === selectedAgentId;
              return (
                <div
                  className="group flex w-full min-w-0 items-center gap-0.5"
                  key={agent.id}
                >
                  <button
                    className={compactTreeRowClassFlexFill(Boolean(isActive))}
                    onClick={() => runNav(() => onSelectAgent(agent.id))}
                    title={agent.name}
                    type="button"
                  >
                    <AgentTreeIcon kind={agent.kind} />
                    <span className="min-w-0 flex-1 truncate leading-snug">
                      {agent.name}
                    </span>
                  </button>
                  <Button
                    aria-label={t("workspace.sidebarUnpinAgentAria")}
                    className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      unpinAgent(agent.id);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <PinOff aria-hidden className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <WorkspaceCollapsibleSection
        addAriaLabel={
          onAddAgent ? t("workspace.sidebarAddAgentAria") : undefined
        }
        collapseAriaLabel={t("workspace.sidebarCollapseSectionAria")}
        expandAriaLabel={t("workspace.sidebarExpandSectionAria")}
        lockOpen={catalogSearchActive}
        onAdd={onAddAgent ? () => runNav(() => onAddAgent()) : undefined}
        onOpenChange={setAgentsOpen}
        onTitleClick={() => runNav(() => onSelectAgentsList())}
        open={agentsOpen}
        title={t("workspace.sidebarAgents")}
      >
        <div className="flex flex-col gap-0.5 pb-1 pl-1.5">
          {unpinnedFilteredAgents.map((agent) => {
            const isActive = !isLandingPage && agent.id === selectedAgentId;
            return (
              <div
                className="group flex w-full min-w-0 items-center gap-0.5"
                key={agent.id}
              >
                <button
                  className={compactTreeRowClassFlexFill(Boolean(isActive))}
                  onClick={() => runNav(() => onSelectAgent(agent.id))}
                  title={agent.name}
                  type="button"
                >
                  <AgentTreeIcon kind={agent.kind} />
                  <span className="min-w-0 flex-1 truncate leading-snug">
                    {agent.name}
                  </span>
                </button>
                <Button
                  aria-label={t("workspace.sidebarPinAgentAria")}
                  className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    pinAgent(agent.id);
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Pin aria-hidden className="size-3.5" />
                </Button>
              </div>
            );
          })}
          {catalogSearchActive &&
          agents.length > 0 &&
          filteredAgents.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground leading-snug">
              {t("workspace.sidebarCatalogSearchEmpty")}
            </p>
          ) : null}
          {agents.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground leading-snug">
              {emptyAgentsLabel}
            </p>
          ) : null}
          {onAddAgent && !catalogSearchActive ? (
            <SidebarNewLinkRow
              label={t("workspace.sidebarNewAgent")}
              onClick={() => runNav(() => onAddAgent?.())}
            />
          ) : null}
        </div>
      </WorkspaceCollapsibleSection>

      <WorkspaceCollapsibleSection
        addAriaLabel={t("workspace.sidebarAddActionAria")}
        collapseAriaLabel={t("workspace.sidebarCollapseSectionAria")}
        expandAriaLabel={t("workspace.sidebarExpandSectionAria")}
        lockOpen={catalogSearchActive}
        onAdd={() => runNav(() => onSelectAction("new"))}
        onOpenChange={setActionsOpen}
        onTitleClick={() => runNav(() => onSelectActionsList())}
        open={actionsOpen}
        title={t("workspace.sidebarActions")}
      >
        <div className="flex flex-col gap-0.5 pb-1 pl-1.5">
          <WorkspaceNavCatalogGroupedList
            emptyLabel={actionsListEmptyLabel}
            folders={filteredActionsPartition.folders}
            forceModuleFoldersOpen={catalogSearchActive}
            getFolderIcon={(folder) =>
              folder.moduleId === TENANT_ACTIONS_FOLDER_ID
                ? FolderPen
                : undefined
            }
            getFolderLabel={(folder) =>
              folder.moduleId === TENANT_ACTIONS_FOLDER_ID
                ? t("skills.origin.tenant")
                : undefined
            }
            isFolderOpen={isFolderOpen}
            loading={actionsLoading}
            loadingLabel={t("actionsCatalog.loading")}
            newRow={
              catalogSearchActive ? null : (
                <SidebarNewLinkRow
                  label={t("workspace.sidebarNewAction")}
                  onClick={() => runNav(() => onSelectAction("new"))}
                />
              )
            }
            renderItem={(action) => (
              <button
                className={compactTreeRowClass(action.id === selectedActionId)}
                onClick={() => runNav(() => onSelectAction(action.id))}
                title={action.name}
                type="button"
              >
                <CatalogTreeIcon icon={ListChecks} />
                <span className="min-w-0 flex-1 truncate leading-snug">
                  {action.name}
                </span>
              </button>
            )}
            root={filteredActionsPartition.root}
            section="actions"
            toggleFolder={toggleFolder}
          />
        </div>
      </WorkspaceCollapsibleSection>
    </div>
  );
}
