import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { InlineEditableRichText } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import { useTeamMembersCatalogQuery } from "@engenty/tasks/ui/assignee";
import {
  NewTaskDialog,
  type TaskFormSubmitData,
  useCreateTaskMutation,
} from "@engenty/tasks/ui/new-task";
import { cn, DocSidebarLayout, Tabs, useDocSidebar } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { PhaseTask, ProjectPhase } from "../api.js";
import { PhaseFormDialog } from "../components/phase-form-dialog.js";
import { ProjectDetailHeader } from "../components/project-detail-header.js";
import { ProjectDetailPageActions } from "../components/project-detail-page-actions.js";
import { ProjectDetailSkeleton } from "../components/project-detail-skeleton.js";
import { ProjectStarButton } from "../components/project-pin-button.js";
import { ProjectPlanningTab } from "../components/project-planning-tab.js";
import { ProjectSettingsPanel } from "../components/project-settings-panel.js";
import { ProjectTabsConfigDialog } from "../components/project-tabs-config-dialog.js";
import { ProjectTeamMembersSection } from "../components/project-team-members-section.js";
import { ProjectTimeplanSection } from "../components/project-timeplan-section.js";
import { TaskFormDialog } from "../components/task-form-dialog.js";
import { useProjectDetail } from "../hooks/use-project-detail.js";
import { useProjectDetailHandlers } from "../hooks/use-project-detail-handlers.js";
import { useProjectDetailTabs } from "../hooks/use-project-detail-tabs.js";
import {
  DEFAULT_ENABLED_TABS,
  PROJECTS_DETAIL_SURFACE,
  type ProjectTab,
  useProjectTabs,
} from "../hooks/use-project-tabs.js";
import { useProjectsDetailAgentUiSlice } from "../hooks/use-projects-agent-ui-slice.js";
import { useProjectsModuleSecondaryShellNav } from "../hooks/use-projects-module-secondary-shell-nav.js";
import { PROJECT_SETTINGS_SIDEBAR_KEY } from "../lib/project-settings-sidebar.js";
import {
  useCreateProjectPhaseMutation,
  useUpdateProjectDetailMutation,
  useUpdateProjectPhaseMutation,
} from "../optimistic-mutations.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { projectKeys, useProjectSettings } from "../queries.js";

const EMPTY_TEAM_CATALOG: TeamMemberCatalogRow[] = [];

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation("projects");
  const { setCopilotContext } = useCopilotShell();

  const [phaseFormOpen, setPhaseFormOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<ProjectPhase | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PhaseTask | null>(null);
  const [addTaskPhaseId, setAddTaskPhaseId] = useState<string | null>(null);
  // Creating goes through the tasks module's dialog; the side panel below is
  // for editing an existing task only.
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [openTabsConfig, setOpenTabsConfig] = useState(false);
  const [viewMode, setViewMode] = useState<"internal" | "external">("internal");
  const settingsSidebar = useDocSidebar(PROJECT_SETTINGS_SIDEBAR_KEY);
  const settingsInlineOpen =
    settingsSidebar.mode === "inline" && settingsSidebar.open;
  const [portalDropdownOpen, setPortalDropdownOpen] = useState(false);

  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const projectSettingsQuery = useProjectSettings();
  const teamMembersEnabled = teamMembersCatalogQuery.pluginEnabled;
  const teamMembersCatalog = teamMembersCatalogQuery.data ?? EMPTY_TEAM_CATALOG;
  const teamMembersLoading =
    teamMembersEnabled &&
    (teamMembersCatalogQuery.isLoading || teamMembersCatalogQuery.isFetching);
  const teamMembersError =
    teamMembersEnabled && teamMembersCatalogQuery.error
      ? teamMembersCatalogQuery.error instanceof Error
        ? teamMembersCatalogQuery.error.message
        : t("detail.members.loadFailed")
      : null;
  const { project, loading, error, loadProject } = useProjectDetail(
    id,
    teamMembersCatalog
  );
  const createPhaseMutation = useCreateProjectPhaseMutation(id ?? "");
  const updatePhaseMutation = useUpdateProjectPhaseMutation(id ?? "");
  const updateProjectMutation = useUpdateProjectDetailMutation(id ?? "");

  // Tab configuration is persisted on the project (enabled_tabs). Drive the UI
  // from the project so it survives reloads; persist changes optimistically.
  const enabledTabs = useMemo<ProjectTab[]>(
    () =>
      (project?.enabled_tabs as ProjectTab[] | null | undefined) ??
      DEFAULT_ENABLED_TABS,
    [project?.enabled_tabs]
  );
  const handleTabsChange = useCallback(
    (tabs: ProjectTab[]) => {
      if (!id) {
        return;
      }
      updateProjectMutation.mutate({ enabled_tabs: tabs });
    },
    [id, updateProjectMutation]
  );

  const {
    activeTask,
    handleBriefingSave,
    handleDragEnd,
    handleDragStart,
    handlePhaseSubmit,
    handlePhaseDelete,
    handlePhaseVisibilityToggle,
    handleProjectSettingsSave,
    handleCoverChange,
    handleSubtitleChange,
    handleClientChange,
    handleTaskDelete,
    handleTaskStatusChange,
    handleTaskSubmit,
    handleTaskVisibilityToggle,
  } = useProjectDetailHandlers({
    id,
    project,
    editingPhase,
    editingTask,
    addTaskPhaseId,
    setPhaseFormOpen,
    setEditingPhase,
    setTaskFormOpen,
    setEditingTask,
    setAddTaskPhaseId,
  });

  const queryClient = useQueryClient();
  const createTaskMutation = useCreateTaskMutation();
  // Same payload the tasks module sends: the project link is `project_id`,
  // the phase rides in the project context's metadata.
  const handleNewTaskSubmit = useCallback(
    async (data: TaskFormSubmitData) => {
      if (!id) {
        return;
      }
      await createTaskMutation.mutateAsync({
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        due_date: data.due_date,
        project_id: id,
        primary_assignee_kind: data.primary_assignee_kind,
        primary_assignee_user_id: data.primary_assignee_user_id,
        primary_assignee_agent_type_key: data.primary_assignee_agent_type_key,
        collaborator_user_ids: data.collaborator_user_ids,
        // Always link the project context: it is what lists the task on this
        // page. Without a phase it lands under Allgemeine Aufgaben.
        contexts: [
          {
            context_id: id,
            context_type: "project",
            metadata: { phase_id: data.phase_id ?? null },
          },
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: projectKeys.detail(id),
      });
    },
    [createTaskMutation, id, queryClient]
  );

  // Stable identity: the dialog resets its form when this prop changes.
  const newTaskProject = useMemo(
    () => (project ? { id: project.id, title: project.title } : null),
    [project?.id, project?.title]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const timeplanEnabled = project?.timeplan_enabled !== false;

  const { activeTab, setActiveTab } = useProjectTabs();
  const allTabs = useProjectDetailTabs(timeplanEnabled);

  const visibleTabs = useMemo(
    () => allTabs.filter((tab) => enabledTabs.includes(tab.id) || tab.required),
    [allTabs, enabledTabs]
  );
  const visibleTabIds = useMemo(
    () => visibleTabs.map((tab) => tab.id),
    [visibleTabs]
  );

  const effectiveActiveTab = useMemo(
    () => (visibleTabIds.includes(activeTab) ? activeTab : "planning"),
    [activeTab, visibleTabIds]
  );

  const activeContributedTab = useMemo(
    () =>
      visibleTabs.find(
        (tab) => tab.id === effectiveActiveTab && tab.component
      ) ?? null,
    [visibleTabs, effectiveActiveTab]
  );

  useEffect(() => {
    if (!visibleTabIds.includes(activeTab)) {
      setActiveTab("planning");
    }
  }, [activeTab, visibleTabIds, setActiveTab]);

  useEffect(() => {
    if (project?.title != null) {
      setTitleValue(project.title);
    }
  }, [project?.title]);

  const handleUpdateTitle = useCallback(async () => {
    if (!(id && titleValue.trim())) {
      if (!titleValue.trim() && project) {
        setTitleValue(project.title);
      }
      setEditingTitle(false);
      return;
    }
    updateProjectMutation.mutate({ title: titleValue.trim() });
    setEditingTitle(false);
  }, [id, titleValue, project, updateProjectMutation]);

  const resetTitleEditing = useCallback(() => {
    setEditingTitle(false);
    if (project) {
      setTitleValue(project.title);
    }
  }, [project]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useProjectsModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      // Prefer the title; while loading avoid flashing the raw UUID in the crumb.
      project && id
        ? {
            label: (
              <span className="group/crumb inline-flex min-w-0 items-center gap-0.5">
                <span className="truncate">{project.title}</span>
                <ProjectStarButton
                  projectId={id}
                  revealClassName="group-hover/crumb:opacity-100"
                />
              </span>
            ),
            menuLabel: project.title,
          }
        : { label: loading ? "…" : (id ?? "…") },
    ],
    [moduleRootCrumb, project, loading, id]
  );

  const handleCopyPortalLink = useCallback(
    (e: React.MouseEvent) => {
      if (!id) {
        return;
      }
      const portalUrl = `${window.location.origin}/portal/${id}`;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        e.preventDefault();
        window.open(portalUrl, "_blank");
        return;
      }
      navigator.clipboard.writeText(portalUrl);
    },
    [id]
  );

  const handleCopyLinkToClipboard = useCallback(() => {
    if (!id) {
      return;
    }
    navigator.clipboard.writeText(`${window.location.origin}/portal/${id}`);
  }, [id]);

  const pageActions = useMemo(
    () => (
      <ProjectDetailPageActions
        onCopyLink={handleCopyLinkToClipboard}
        onCopyLinkClick={handleCopyPortalLink}
        onPortalDropdownOpenChange={setPortalDropdownOpen}
        onViewModeChange={setViewMode}
        portalDropdownOpen={portalDropdownOpen}
        portalEnabled={!!project?.portal_enabled}
        portalUrl={id ? `${window.location.origin}/portal/${id}` : ""}
        viewMode={viewMode}
      />
    ),
    [
      project?.portal_enabled,
      viewMode,
      portalDropdownOpen,
      handleCopyPortalLink,
      handleCopyLinkToClipboard,
      id,
    ]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    // Float the transparent topbar over the white header so the two blend.
    topbarOverlap: true,
  });

  useProjectsDetailAgentUiSlice({ entityId: id ?? null, project });

  useEffect(() => {
    if (!id) {
      return;
    }
    const title = project?.title?.trim() ?? "";
    setCopilotContext({
      scope: {
        currentModule: "projects",
        entityId: id,
        ...(title ? { project_title: title } : {}),
      },
    });
    return () => setCopilotContext(null);
  }, [id, project?.title, setCopilotContext]);

  const handlePhaseCreate = useCallback(
    async (title: string) => {
      if (!id) {
        return null;
      }
      // The row paints from `onMutate`; the awaited id is the server's.
      const newPhase = await createPhaseMutation.mutateAsync({
        end_date: null,
        is_main: false,
        is_public: false,
        order_index: project?.phases?.length ?? 0,
        start_date: null,
        title,
      });
      return newPhase.id;
    },
    [id, project?.phases?.length, createPhaseMutation]
  );

  const handlePhaseTitleUpdate = useCallback(
    (phaseId: string, title: string) => {
      if (!id) {
        return;
      }
      updatePhaseMutation.mutate({ patch: { title }, phaseId });
    },
    [id, updatePhaseMutation]
  );

  const handlePhaseUpdate = useCallback(
    (phaseId: string, startDate: string | null, endDate: string | null) => {
      if (!id) {
        return;
      }
      updatePhaseMutation.mutate({
        patch: { end_date: endDate, start_date: startDate },
        phaseId,
      });
    },
    [id, updatePhaseMutation]
  );

  if (!id) {
    return null;
  }
  if (loading) {
    return <ProjectDetailSkeleton />;
  }
  if (error) {
    return <p className="p-page text-red-600 text-sm">{error}</p>;
  }
  if (!project) {
    return (
      <p className="p-page text-muted-foreground text-sm">Project not found</p>
    );
  }

  const filteredGeneralTasks =
    viewMode === "external"
      ? project.general_tasks.filter((t) => t.is_public)
      : project.general_tasks;

  const filteredPhases =
    viewMode === "external"
      ? project.phases
          .filter((p) => p.is_public)
          .map((p) => ({
            ...p,
            tasks: p.tasks.filter((t) => t.is_public),
          }))
      : project.phases;

  const dateLocale = i18n.language?.startsWith("de") ? "de" : "en";

  const taskStatusDefinitions =
    projectSettingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;

  const openTaskCount = [
    ...project.general_tasks,
    ...project.phases.flatMap((phase) => phase.tasks),
  ].filter((task) => task.status !== "done").length;

  const wideTab = Boolean(
    activeContributedTab || effectiveActiveTab === "timeplan"
  );

  return (
    <Tabs
      className="flex h-full flex-col overflow-hidden"
      data-engenty-region="detail"
      onValueChange={(v) => setActiveTab(v as ProjectTab)}
      value={effectiveActiveTab}
    >
      <ProjectDetailHeader
        editingTitle={editingTitle}
        onCancelTitle={resetTitleEditing}
        onClientChange={
          viewMode === "internal" ? handleClientChange : undefined
        }
        onConfigureClick={() => setOpenTabsConfig(true)}
        onCoverChange={viewMode === "internal" ? handleCoverChange : undefined}
        onSaveTitle={handleUpdateTitle}
        onStartEditTitle={() => setEditingTitle(true)}
        onSubtitleChange={
          viewMode === "internal" ? handleSubtitleChange : undefined
        }
        onTitleChange={setTitleValue}
        openTaskCount={openTaskCount}
        project={project}
        team={
          teamMembersEnabled
            ? {
                catalog: teamMembersCatalog,
                editable: viewMode === "internal",
                onProjectUpdated: loadProject,
              }
            : null
        }
        titleValue={titleValue}
        visibleTabs={visibleTabs}
        // An open inline settings column widens the content row; the header
        // spans the same width so the cover sits over both.
        wide={wideTab || settingsInlineOpen}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Settings sit beside the content as the offer draft's do: an inline
            column when there is room, an overlay sheet when not. */}
        <DocSidebarLayout
          className={cn(
            "px-page pt-2 pb-24 sm:pt-4 md:pt-5",
            // Contributed tabs (e.g. the files manager) are workspace tools — let
            // them use the full content width instead of the narrow reading
            // column used by the native tabs. The Gantt is the same kind of
            // surface: more width means more visible weeks. An open inline
            // sidebar widens the row to the header's 6xl, so the reading
            // column keeps roughly its measure beside it.
            wideTab
              ? "max-w-[100rem]"
              : settingsInlineOpen
                ? "max-w-6xl"
                : "max-w-3xl"
          )}
          inlineMinWidth={1100}
          resizable
          sidebar={
            <ProjectSettingsPanel
              clientId={project.client_id}
              clientName={project.client_name}
              endDate={project.end_date}
              onSave={handleProjectSettingsSave}
              portalEnabled={project.portal_enabled}
              portalPassword={project.portal_password ?? null}
              projectId={id}
              startDate={project.start_date}
              team={
                teamMembersEnabled ? (
                  <ProjectTeamMembersSection
                    catalog={teamMembersCatalog}
                    defaultExpanded
                    onProjectUpdated={loadProject}
                    projectId={id}
                    projectTeamMembers={project.project_team ?? []}
                    variant="sidebar"
                  />
                ) : null
              }
              timeplanEnabled={timeplanEnabled}
            />
          }
          sidebarLabel={t("detail.projectSettings.title")}
          storageKey={PROJECT_SETTINGS_SIDEBAR_KEY}
        >
          <div className="space-y-4">
            {effectiveActiveTab === "planning" && (
              <ProjectPlanningTab
                activeTask={activeTask}
                dateLocale={dateLocale}
                filteredGeneralTasks={filteredGeneralTasks}
                filteredPhases={filteredPhases}
                onAddTaskToPhase={(phaseId) => {
                  setAddTaskPhaseId(phaseId);
                  setNewTaskOpen(true);
                }}
                onBriefingSave={handleBriefingSave}
                onDragEnd={handleDragEnd}
                onDragStart={handleDragStart}
                onPhaseCreate={handlePhaseCreate}
                onPhaseEdit={(p) => {
                  setEditingPhase(p);
                  setPhaseFormOpen(true);
                }}
                onPhaseFormOpen={() => {
                  setEditingPhase(null);
                  setPhaseFormOpen(true);
                }}
                onPhaseTitleUpdate={handlePhaseTitleUpdate}
                onPhaseUpdate={handlePhaseUpdate}
                onPhaseVisibilityToggle={handlePhaseVisibilityToggle}
                onTaskAdd={() => {
                  setAddTaskPhaseId(null);
                  setNewTaskOpen(true);
                }}
                onTaskDelete={handleTaskDelete}
                onTaskEdit={(task, phaseId) => {
                  setEditingTask(task);
                  setAddTaskPhaseId(phaseId ?? null);
                  setTaskFormOpen(true);
                }}
                onTaskStatusChange={handleTaskStatusChange}
                onTaskVisibilityToggle={handleTaskVisibilityToggle}
                onViewNotes={
                  visibleTabIds.includes("notes")
                    ? () => setActiveTab("notes")
                    : undefined
                }
                project={project}
                projectId={id}
                sensors={sensors}
                taskStatusDefinitions={taskStatusDefinitions}
                teamMembersEnabled={teamMembersEnabled}
                viewMode={viewMode}
              />
            )}

            {effectiveActiveTab === "timeplan" && (
              <div className="mt-4">
                <ProjectTimeplanSection
                  dateLocale={dateLocale}
                  endDate={project.end_date}
                  onPhaseCreate={handlePhaseCreate}
                  onPhaseFormOpen={() => {
                    setEditingPhase(null);
                    setPhaseFormOpen(true);
                  }}
                  onPhaseTitleUpdate={handlePhaseTitleUpdate}
                  onPhaseUpdate={handlePhaseUpdate}
                  phases={filteredPhases}
                  startDate={project.start_date}
                  viewMode={viewMode}
                />
              </div>
            )}

            {effectiveActiveTab === "notes" && (
              <div className="mt-4">
                <InlineEditableRichText
                  content={project.briefing ?? ""}
                  disabled={viewMode === "external"}
                  filledPreviewEditLabel={t("detail.briefing.editAria")}
                  onSave={(html: string) =>
                    handleBriefingSave(
                      html.trim() === "" || html === "<p></p>" ? null : html
                    )
                  }
                  placeholder={t("detail.briefing.placeholder")}
                  readOnlyFilledPreview
                />
              </div>
            )}

            {/* Tabs other modules contribute to `projects.detail` (e.g. files,
              time-tracking) render their own body here. They only appear when
              the owning module is installed — projects no longer hard-imports
              their UI. */}
            {activeContributedTab?.component && (
              <activeContributedTab.component
                params={{ projectId: id, viewMode }}
                surface={PROJECTS_DETAIL_SURFACE}
              />
            )}

            <ProjectTabsConfigDialog
              availableTabs={allTabs}
              enabledTabs={enabledTabs}
              onClose={() => setOpenTabsConfig(false)}
              onTabsChange={handleTabsChange}
              open={openTabsConfig}
            />

            <PhaseFormDialog
              onDelete={handlePhaseDelete}
              onOpenChange={(open) => {
                setPhaseFormOpen(open);
                if (!open) {
                  setEditingPhase(null);
                }
              }}
              onSubmit={handlePhaseSubmit}
              open={phaseFormOpen}
              phase={editingPhase}
              portalEnabled={Boolean(project.portal_enabled)}
              projectName={project.title}
              targetPhases={
                project.phases
                  ?.filter((p) => p.id !== editingPhase?.id)
                  .map((p) => ({ id: p.id, title: p.title })) ?? []
              }
              taskCount={
                project.phases?.find((p) => p.id === editingPhase?.id)?.tasks
                  .length ?? 0
              }
            />

            <NewTaskDialog
              defaultPhaseId={addTaskPhaseId}
              onOpenChange={(open) => {
                setNewTaskOpen(open);
                if (!open) {
                  setAddTaskPhaseId(null);
                }
              }}
              onSubmit={handleNewTaskSubmit}
              open={newTaskOpen}
              project={newTaskProject}
              teamMembersCatalog={teamMembersCatalog}
              teamMembersEnabled={teamMembersEnabled}
            />

            <TaskFormDialog
              onDelete={handleTaskDelete}
              onOpenChange={(open) => {
                setTaskFormOpen(open);
                if (!open) {
                  setEditingTask(null);
                  setAddTaskPhaseId(null);
                }
              }}
              onSubmit={handleTaskSubmit}
              open={taskFormOpen}
              phaseId={addTaskPhaseId}
              phases={
                project.phases?.map((p) => ({ id: p.id, title: p.title })) ?? []
              }
              portalEnabled={Boolean(project.portal_enabled)}
              projectMemberIds={
                project.project_team?.map((m) => m.user_id) ?? []
              }
              projectName={project.title}
              task={editingTask}
              taskStatusDefinitions={taskStatusDefinitions}
              teamMembersCatalog={teamMembersCatalog}
              teamMembersEnabled={teamMembersEnabled}
              teamMembersError={teamMembersError}
              teamMembersLoading={teamMembersLoading}
            />
          </div>
        </DocSidebarLayout>
      </div>
    </Tabs>
  );
}
