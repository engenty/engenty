import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { InlineEditableRichText } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import { useTeamMembersCatalogQuery } from "@engenty/tasks/ui/assignee";
import { Tabs } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import {
  createPhase,
  type PhaseTask,
  type ProjectPhase,
  type ProjectWithPhasesAndTasks,
  updatePhase,
  updateProject,
} from "../api.js";
import { PhaseFormDialog } from "../components/phase-form-dialog.js";
import { ProjectDetailHeader } from "../components/project-detail-header.js";
import { ProjectDetailPageActions } from "../components/project-detail-page-actions.js";
import { ProjectDetailSkeleton } from "../components/project-detail-skeleton.js";
import { ProjectPlanningTab } from "../components/project-planning-tab.js";
import { ProjectSettingsPanel } from "../components/project-settings-panel.js";
import { ProjectTabsConfigDialog } from "../components/project-tabs-config-dialog.js";
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
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [openTabsConfig, setOpenTabsConfig] = useState(false);
  const [viewMode, setViewMode] = useState<"internal" | "external">("internal");
  const [openProjectSettings, setOpenProjectSettings] = useState(false);
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
  const queryClient = useQueryClient();

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
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(
        projectKeys.detail(id),
        (prev) => (prev ? { ...prev, enabled_tabs: tabs } : prev)
      );
      updateProject(id, { enabled_tabs: tabs }).catch(() => {
        void loadProject();
      });
    },
    [id, queryClient, loadProject]
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
    handleTaskDelete,
    handleTaskStatusChange,
    handleTaskSubmit,
    handleTaskVisibilityToggle,
  } = useProjectDetailHandlers({
    id,
    project,
    loadProject,
    editingPhase,
    editingTask,
    addTaskPhaseId,
    setPhaseFormOpen,
    setEditingPhase,
    setTaskFormOpen,
    setEditingTask,
    setAddTaskPhaseId,
  });

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
    try {
      const { updateProject } = await import("../api.js");
      await updateProject(id, { title: titleValue.trim() });
      setEditingTitle(false);
      await loadProject();
    } catch {
      // Leave editing state; user can retry or cancel
    }
  }, [id, titleValue, project, loadProject]);

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
      { label: project?.title ?? (loading ? "…" : (id ?? "…")) },
    ],
    [moduleRootCrumb, project?.title, loading, id]
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
        onOpenProjectSettings={() => setOpenProjectSettings(true)}
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
    topbarChrome: "contentBlend",
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
      const newPhase = await createPhase(id, {
        title,
        start_date: null,
        end_date: null,
        is_main: false,
        is_public: false,
        order_index: project?.phases?.length ?? 0,
      });
      await loadProject();
      return newPhase.id;
    },
    [id, project?.phases?.length, loadProject]
  );

  const handlePhaseTitleUpdate = useCallback(
    async (phaseId: string, title: string) => {
      if (!id) {
        return;
      }
      await updatePhase(id, phaseId, { title });
      await loadProject();
    },
    [id, loadProject]
  );

  const handlePhaseUpdate = useCallback(
    async (
      phaseId: string,
      startDate: string | null,
      endDate: string | null
    ) => {
      if (!id) {
        return;
      }
      await updatePhase(id, phaseId, {
        start_date: startDate,
        end_date: endDate,
      });
      await loadProject();
    },
    [id, loadProject]
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
        onConfigureClick={() => setOpenTabsConfig(true)}
        onSaveTitle={handleUpdateTitle}
        onStartEditTitle={() => setEditingTitle(true)}
        onTitleChange={setTitleValue}
        project={project}
        titleValue={titleValue}
        visibleTabs={visibleTabs}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={`mx-auto space-y-4 px-page pt-2 pb-24 sm:pt-4 md:pt-5 ${
            // Contributed tabs (e.g. the files manager) are workspace tools — let
            // them use the full content width instead of the narrow reading
            // column used by the native tabs. The Gantt is the same kind of
            // surface: more width means more visible weeks.
            activeContributedTab || effectiveActiveTab === "timeplan"
              ? "max-w-[100rem]"
              : "max-w-6xl"
          }`}
        >
          {effectiveActiveTab === "planning" && (
            <ProjectPlanningTab
              activeTask={activeTask}
              dateLocale={dateLocale}
              filteredGeneralTasks={filteredGeneralTasks}
              filteredPhases={filteredPhases}
              loadProject={loadProject}
              onAddTaskToPhase={(phaseId) => {
                setAddTaskPhaseId(phaseId);
                setEditingTask(null);
                setTaskFormOpen(true);
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
                setEditingTask(null);
                setTaskFormOpen(true);
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
              teamMembersCatalog={teamMembersCatalog}
              teamMembersEnabled={teamMembersEnabled}
              teamMembersError={teamMembersError}
              teamMembersLoading={teamMembersLoading}
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
            projectMemberIds={project.project_team?.map((m) => m.user_id) ?? []}
            projectName={project.title}
            task={editingTask}
            taskStatusDefinitions={taskStatusDefinitions}
            teamMembersCatalog={teamMembersCatalog}
            teamMembersEnabled={teamMembersEnabled}
            teamMembersError={teamMembersError}
            teamMembersLoading={teamMembersLoading}
          />

          <ProjectSettingsPanel
            clientId={project.client_id}
            clientName={project.client_name}
            endDate={project.end_date}
            onClose={() => setOpenProjectSettings(false)}
            onSave={handleProjectSettingsSave}
            open={openProjectSettings}
            portalEnabled={project.portal_enabled}
            portalPassword={project.portal_password ?? null}
            projectId={id}
            startDate={project.start_date}
            timeplanEnabled={timeplanEnabled}
          />
        </div>
      </div>
    </Tabs>
  );
}
