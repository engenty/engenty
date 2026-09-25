import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { useInboxAttentionCountQuery } from "@engenty/ai-ui/embed";
import { requestApiEnvelope } from "@engenty/api-client";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  cn,
  Input,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  Skeleton,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import {
  Activity,
  Inbox,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type {
  Task,
  TaskPriority,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { useTeamMembersCatalogQuery } from "../hooks/use-team-catalog-query.js";
import { resolveTaskStatusDotTone } from "../lib/task-status-styles.js";
import {
  isBriefingPath,
  isOperationsPath,
  isSettingsPath,
  isTaskDetailPath,
  isTasksListPath,
  tasksPaths,
} from "../lib/tasks-routes.js";
import {
  collectTaskAgentFilterOptions,
  collectTaskUserFilterOptions,
  organizeSidebarTasks,
  type TasksSidebarOrganizationLabels,
} from "../lib/tasks-sidebar-organization.js";
import { useTasksSidebarPrefs } from "../lib/use-tasks-sidebar-prefs.js";
import { buildAssigneeProfileMap } from "../plugins.js";
import {
  tasksListOptions,
  useCreateTaskMutation,
  useTaskSettingsQuery,
  useTasksListQuery,
} from "../tasks-queries.js";
import { NewTaskDialog } from "./new-task-dialog.js";
import type { TaskFormSubmitData } from "./task-form-dialog.js";
import { resolveTaskStatusLabel } from "./task-status-badge.js";
import { TasksModuleAddMenuSidebarTrigger } from "./tasks-module-add-menu.js";
import { TasksSidebarListSettings } from "./tasks-sidebar-list-settings.js";

const SIDEBAR_FETCH_SIZE = 200;

function SidebarNavRow({
  active,
  badgeCount,
  icon: Icon,
  label,
  to,
  onCreate,
  createAriaLabel,
}: {
  active: boolean;
  badgeCount?: number;
  icon?: LucideIcon;
  label: string;
  to: string;
  onCreate?: () => void;
  createAriaLabel?: string;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
          {badgeCount ? (
            <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground leading-none">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          ) : null}
        </Link>
      </SidebarRowButton>
      {onCreate ? (
        <SidebarRowActions>
          <Button
            aria-label={createAriaLabel}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCreate();
            }}
            title={createAriaLabel}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
          </Button>
        </SidebarRowActions>
      ) : null}
    </SidebarRow>
  );
}

/** Compact footer links (KB-style secondary nav rows). */
function SidebarSecondaryNavRow({
  active,
  icon: Icon,
  label,
  to,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  to: string;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowLeadingIcon icon={<Icon aria-hidden />} />
      <SidebarRowButton asChild isActive={active} size="sm">
        <Link to={to} {...shellSecondaryNavItemProps}>
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

function TaskSidebarRow({
  active,
  definitions,
  task,
}: {
  active: boolean;
  definitions: TaskStatusDefinition[];
  task: Task;
}) {
  const statusDefinition = definitions.find(
    (definition) => definition.id === task.status
  );
  const statusLabel = resolveTaskStatusLabel(task.status, definitions);
  const dotClass = resolveTaskStatusDotTone(statusDefinition?.color);

  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={tasksPaths.taskDetail(task.id)}
          {...shellSecondaryNavItemProps}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", dotClass)}
              title={statusLabel}
            />
            <span className="min-w-0 flex-1 truncate">
              <span className="mr-1.5 font-mono text-muted-foreground text-xs">
                {task.identifier}
              </span>
              {task.title}
            </span>
          </span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

function SidebarEntitySkeleton() {
  return (
    <div className="flex flex-col gap-1.5 pl-2">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton className="h-6 w-full" key={`tsk-${i}`} />
      ))}
    </div>
  );
}

function SidebarGroupedList<T extends Task>(props: {
  emptyLabel: string;
  groups: Array<{
    count: number;
    id: string;
    items: T[];
    label: string;
  }>;
  renderItem: (item: T) => ReactNode;
}) {
  const { t } = useTranslation("tasks");
  const totalCount = props.groups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );

  if (totalCount === 0) {
    return (
      <p className="pl-2 text-muted-foreground text-xs">{props.emptyLabel}</p>
    );
  }

  return (
    <SidebarNavList>
      {props.groups.map((group) => (
        <div className="contents" key={group.id}>
          {group.label ? (
            <SidebarNavSectionLabel>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{group.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {t("sidebar.groupCount", { count: group.count })}
                </span>
              </span>
            </SidebarNavSectionLabel>
          ) : null}
          {group.items.map((item) => props.renderItem(item))}
        </div>
      ))}
    </SidebarNavList>
  );
}

export function TasksSidebarPanel() {
  const { t, i18n } = useTranslation("tasks");
  // Canonical, not raw: in a space this is `/s/<key>/<segment>/…`, and every
  // matcher below is written against `/mdl/<module>/…`.
  const pathname = canonicalModulePathname(useLocation().pathname);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;
  const { prefs, updateTasksPrefs } = useTasksSidebarPrefs();

  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const createTaskMutation = useCreateTaskMutation();

  const handleCreateTaskSubmit = useCallback(
    async (data: TaskFormSubmitData) => {
      const created = await createTaskMutation.mutateAsync({
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        due_date: data.due_date,
        project_id: data.project_id,
        primary_assignee_kind: data.primary_assignee_kind,
        primary_assignee_user_id: data.primary_assignee_user_id,
        primary_assignee_agent_type_key: data.primary_assignee_agent_type_key,
        collaborator_user_ids: data.collaborator_user_ids,
      });
      setCreateTaskOpen(false);
      navigate(tasksPaths.taskDetail(created.id));
    },
    [createTaskMutation, navigate]
  );

  useEffect(() => {
    void i18n.loadNamespaces(["tasks"]);
  }, [i18n]);

  const settingsQuery = useTaskSettingsQuery();
  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;
  const assigneeProfiles = useMemo(
    () => buildAssigneeProfileMap(teamMembersCatalogQuery.data ?? []),
    [teamMembersCatalogQuery.data]
  );

  const activeTaskId = isTaskDetailPath(pathname);

  const tasksQuery = useTasksListQuery({
    page: 1,
    pageSize: SIDEBAR_FETCH_SIZE,
    sortBy: prefs.tasks.sortBy,
    sortOrder: prefs.tasks.sortOrder,
    status: prefs.tasks.status === "all" ? undefined : prefs.tasks.status,
  });

  const taskSearchQuery = useQuery({
    ...tasksListOptions({
      page: 1,
      pageSize: SIDEBAR_FETCH_SIZE,
      search: trimmed,
      sortBy: "title",
      sortOrder: "asc",
    }),
    enabled: isSearching,
  });

  const tasks = tasksQuery.data?.data ?? [];
  const taskHits = taskSearchQuery.data?.data ?? [];

  const projectsQuery = useQuery({
    queryKey: ["projects", "list-minimal"],
    queryFn: async ({ signal }) => {
      const res = await requestApiEnvelope<
        Array<{ id: string; title: string }>
      >("/api/projects?pageSize=100&sortBy=title&sortOrder=asc", {
        method: "GET",
        signal,
      });
      return res.data;
    },
    enabled: prefs.tasks.groupBy === "project",
    staleTime: 60_000,
  });

  const projectTitleById = useMemo(
    () => new Map((projectsQuery.data ?? []).map((p) => [p.id, p.title])),
    [projectsQuery.data]
  );

  const organizationLabels = useMemo(
    (): TasksSidebarOrganizationLabels => ({
      assigneeUnassigned: t("sidebar.unassigned"),
      dueLater: t("sidebar.dueLater"),
      dueNoDate: t("sidebar.dueNoDate"),
      dueOverdue: t("sidebar.dueOverdue"),
      dueThisWeek: t("sidebar.dueThisWeek"),
      dueToday: t("sidebar.dueToday"),
      dueTomorrow: t("sidebar.dueTomorrow"),
      priority: {
        critical: t("priority.critical"),
        high: t("priority.high"),
        medium: t("priority.medium"),
        low: t("priority.low"),
      } satisfies Record<TaskPriority, string>,
      projectNone: t("newTask.noProject"),
      status: (statusId) =>
        taskStatusDefinitions.find((definition) => definition.id === statusId)
          ?.label ?? statusId,
    }),
    [t, taskStatusDefinitions]
  );

  const taskGroups = useMemo(
    () =>
      organizeSidebarTasks({
        assigneeProfiles,
        labels: organizationLabels,
        prefs: prefs.tasks,
        projectTitleById,
        statusDefinitions: taskStatusDefinitions,
        tasks,
      }),
    [
      assigneeProfiles,
      organizationLabels,
      prefs.tasks,
      projectTitleById,
      taskStatusDefinitions,
      tasks,
    ]
  );

  const userFilterOptions = useMemo(
    () => collectTaskUserFilterOptions(tasks, assigneeProfiles),
    [assigneeProfiles, tasks]
  );
  const agentFilterOptions = useMemo(
    () => collectTaskAgentFilterOptions(tasks),
    [tasks]
  );

  const searchLoading =
    isSearching && (taskSearchQuery.isLoading || taskSearchQuery.isFetching);

  const navActive = useMemo(
    () => ({
      briefing: isBriefingPath(pathname),
      inbox: pathname === tasksPaths.inbox,
      operations: isOperationsPath(pathname),
      settings: isSettingsPath(pathname),
      tasksList: isTasksListPath(pathname),
    }),
    [pathname]
  );
  const inboxAttentionQuery = useInboxAttentionCountQuery();
  const inboxAttention =
    inboxAttentionQuery.data?.in_space ?? inboxAttentionQuery.data?.total ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SidebarHeader className="gap-0 p-0 pb-3">
        {isSearching ? null : (
          <nav
            aria-label={t("sidebar.moduleNavAria")}
            className={cn(
              "pt-2",
              sidebarColumnContentInsetClassName,
              sidebarColumnContentInsetEndClassName
            )}
          >
            <div className="space-y-2">
              <div>
                <SidebarNavList>
                  <SidebarNavRow
                    active={navActive.briefing}
                    icon={LayoutDashboard}
                    label={t("sidebar.briefing")}
                    to={tasksPaths.briefing}
                  />
                  <SidebarNavRow
                    active={navActive.inbox}
                    badgeCount={inboxAttention}
                    icon={Inbox}
                    label={t("sidebar.inbox")}
                    to={tasksPaths.inbox}
                  />
                </SidebarNavList>
              </div>
              <div>
                <SidebarNavSectionLabel>
                  {t("sidebar.sectionWork")}
                </SidebarNavSectionLabel>
                <SidebarNavList>
                  <SidebarRow isActive={false}>
                    <SidebarRowButton
                      isActive={false}
                      onClick={() => setCreateTaskOpen(true)}
                      {...shellSecondaryNavItemProps}
                    >
                      <Plus aria-hidden className="size-4 shrink-0" />
                      <span className="truncate">{t("newTask.title")}</span>
                    </SidebarRowButton>
                  </SidebarRow>
                  <SidebarNavRow
                    active={navActive.tasksList}
                    icon={ListTodo}
                    label={t("sidebar.tasks")}
                    to={tasksPaths.list}
                  />
                </SidebarNavList>
              </div>
            </div>
          </nav>
        )}

        {/* Search / list settings sit above the list — filters scope the tasks list. */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 pt-2",
            sidebarColumnContentInsetClassName,
            sidebarColumnContentInsetEndClassName
          )}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              aria-label={t("sidebar.searchAria")}
              className="h-8 w-full py-0 pr-7 pl-8 text-sm"
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("sidebar.searchPlaceholder")}
              value={search}
              {...shellSecondaryNavItemProps}
            />
            {trimmed ? (
              <Button
                aria-label={t("sidebar.clearSearch")}
                className="absolute top-1/2 right-1 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
                size="icon"
                tabIndex={-1}
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {isSearching ? null : (
            <>
              <TasksSidebarListSettings
                agentFilterOptions={agentFilterOptions}
                onTasksPrefsChange={updateTasksPrefs}
                prefs={prefs}
                taskStatusDefinitions={taskStatusDefinitions}
                teamMembersEnabled={teamMembersCatalogQuery.pluginEnabled}
                userFilterOptions={userFilterOptions}
              />
              <TasksModuleAddMenuSidebarTrigger
                handlers={{ onAddTask: () => setCreateTaskOpen(true) }}
              />
            </>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 flex-1 gap-0.5 overflow-x-hidden px-0 py-0">
        {isSearching ? (
          <SidebarGroup className="min-h-0 flex-1 p-0">
            <SidebarGroupContent>
              {searchLoading ? (
                <p
                  className="flex items-center gap-2 py-2 pl-2 text-muted-foreground text-xs"
                  role="status"
                >
                  <AnimatedLoaderIcon
                    aria-hidden
                    className="shrink-0"
                    play="always"
                    size="xs"
                  />
                  {t("sidebar.searchLoading")}
                </p>
              ) : taskHits.length === 0 ? (
                <p className="py-2 pl-2 text-muted-foreground text-xs">
                  {t("sidebar.noSearchResults")}
                </p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
                  {taskHits.length > 0 ? (
                    <section>
                      <SidebarNavSectionLabel>
                        {t("sidebar.tasksSection")}
                      </SidebarNavSectionLabel>
                      <SidebarNavList>
                        {taskHits.map((task) => (
                          <TaskSidebarRow
                            active={activeTaskId === task.id}
                            definitions={taskStatusDefinitions}
                            key={task.id}
                            task={task}
                          />
                        ))}
                      </SidebarNavList>
                    </section>
                  ) : null}
                </div>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
            <SidebarGroup className="min-h-0 flex-1 p-0">
              <SidebarGroupContent>
                {tasksQuery.isLoading ? (
                  <SidebarEntitySkeleton />
                ) : (
                  <SidebarGroupedList
                    emptyLabel={t("sidebar.noTasks")}
                    groups={taskGroups}
                    renderItem={(task) => (
                      <TaskSidebarRow
                        active={activeTaskId === task.id}
                        definitions={taskStatusDefinitions}
                        key={task.id}
                        task={task}
                      />
                    )}
                  />
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        )}
      </SidebarContent>

      <div
        className={cn(
          "shrink-0 border-border-soft border-t pt-2 pb-2",
          sidebarColumnContentInsetClassName,
          sidebarColumnContentInsetEndClassName
        )}
      >
        <nav aria-label={t("sidebar.extraLinksAria")} className="shrink-0">
          <SidebarNavList>
            <SidebarSecondaryNavRow
              active={navActive.operations}
              icon={Activity}
              label={t("menu.operations")}
              to={tasksPaths.operations}
            />
            <SidebarSecondaryNavRow
              active={navActive.settings}
              icon={Settings}
              label={t("sidebar.settings")}
              to={tasksPaths.settings}
            />
          </SidebarNavList>
        </nav>
      </div>
      <NewTaskDialog
        onOpenChange={setCreateTaskOpen}
        onSubmit={handleCreateTaskSubmit}
        open={createTaskOpen}
        taskStatusDefinitions={taskStatusDefinitions}
        teamMembersCatalog={teamMembersCatalogQuery.data ?? []}
        teamMembersEnabled={teamMembersCatalogQuery.pluginEnabled}
      />
    </div>
  );
}
