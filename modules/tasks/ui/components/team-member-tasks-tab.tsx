import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@engenty/ui-core";
import { ListTodo } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getTasksPluginsApi } from "../plugins.js";
import {
  tasksListOptions,
  useTaskSettingsQuery,
  useUpdateTasksListMutation,
} from "../tasks-queries.js";
import { TaskCard } from "./task-card.js";

export interface TeamMemberTasksTabProps {
  member: {
    id: string;
    user_id: string | null;
    [key: string]: any;
  };
}

export function TeamMemberTasksTab({
  member,
}: {
  member: TeamMemberTasksTabProps["member"];
}) {
  const { t } = useTranslation("team");
  const navigate = useNavigate();

  const pluginsApi = getTasksPluginsApi();
  const isTasksEnabled = pluginsApi?.isPluginEnabled("tasks") ?? false;
  const isProjectsEnabled = pluginsApi?.isPluginEnabled("projects") ?? false;
  const projectsApi = pluginsApi?.get<any>("projects");

  // Deliberately tenant-wide, not space-scoped: this tab answers "what is this
  // PERSON working on", and a member works across spaces. It reaches
  // `tasksListOptions` directly rather than `useTasksListQuery`, which is what
  // keeps it unscoped — see lib/use-task-space-scope.ts.
  const tasksQuery = useQuery({
    ...tasksListOptions({ assigned_to: member.user_id, pageSize: 100 }),
    enabled: isTasksEnabled && !!member.user_id,
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", "list-exposed"],
    queryFn: ({ signal }) => projectsApi.getProjects(signal),
    enabled: isTasksEnabled && isProjectsEnabled && !!projectsApi,
  });

  const settingsQuery = useTaskSettingsQuery({
    enabled: isTasksEnabled,
  });

  const updateListMutation = useUpdateTasksListMutation({
    assigned_to: member.user_id,
    pageSize: 100,
  });

  const tasks = tasksQuery.data?.data ?? [];
  const projects = projectsQuery.data ?? [];
  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ?? [];

  const groupedTasks = useMemo(() => {
    if (!isProjectsEnabled) {
      return [{ id: "all", title: null, tasks }];
    }

    const projectMap = new Map(projects.map((p: any) => [p.id, p]));
    const groups: { id: string; title: string | null; tasks: typeof tasks }[] =
      [];
    const projectGroupsMap = new Map<string, typeof tasks>();
    const noProjectTasks: typeof tasks = [];

    for (const task of tasks) {
      if (task.project_id && projectMap.has(task.project_id)) {
        if (!projectGroupsMap.has(task.project_id)) {
          projectGroupsMap.set(task.project_id, []);
        }
        projectGroupsMap.get(task.project_id)!.push(task);
      } else {
        noProjectTasks.push(task);
      }
    }

    for (const project of projects) {
      const pTasks = projectGroupsMap.get(project.id) || [];
      if (pTasks.length > 0) {
        groups.push({
          id: project.id,
          title: project.title,
          tasks: pTasks,
        });
      }
    }

    if (noProjectTasks.length > 0) {
      groups.push({
        id: "none",
        title: null,
        tasks: noProjectTasks,
      });
    }

    return groups;
  }, [tasks, projects, isProjectsEnabled]);

  const handleTaskClick = (task: any) => {
    navigate(`/mdl/tasks/${task.id}`);
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    try {
      await updateListMutation.mutateAsync({ taskId, input: { status } });
    } catch {}
  };

  if (!member.user_id) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTodo className="h-12 w-12" />
          </EmptyMedia>
          <EmptyTitle>
            {t("detail.work.noTasks", {
              defaultValue: "Keine Aufgaben zugewiesen",
            })}
          </EmptyTitle>
          <EmptyDescription>
            {t("detail.work.noTasksDescription", {
              defaultValue:
                "Diesem Mitglied sind derzeit keine Aufgaben zugewiesen.",
            })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const isLoading =
    tasksQuery.isLoading || (isProjectsEnabled && projectsQuery.isLoading);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">…</p>;
  }

  if (tasks.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTodo className="h-12 w-12" />
          </EmptyMedia>
          <EmptyTitle>
            {t("detail.work.noTasks", {
              defaultValue: "Keine Aufgaben zugewiesen",
            })}
          </EmptyTitle>
          <EmptyDescription>
            {t("detail.work.noTasksDescription", {
              defaultValue:
                "Diesem Mitglied sind derzeit keine Aufgaben zugewiesen.",
            })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      {groupedTasks.map((group) => (
        <div className="space-y-3" key={group.id}>
          <h3 className="font-medium text-lg">
            {group.title
              ? t("detail.work.projectGroup", {
                  title: group.title,
                  defaultValue: `Projekt: ${group.title}`,
                })
              : t("detail.work.generalTasks", {
                  defaultValue: "Allgemeine Aufgaben",
                })}
          </h3>
          <div className="space-y-2">
            {group.tasks.map((task) => (
              <TaskCard
                key={task.id}
                onClick={handleTaskClick}
                onStatusChange={handleStatusChange}
                showAssignee={false}
                task={task}
                taskStatusDefinitions={
                  taskStatusDefinitions.length > 0
                    ? taskStatusDefinitions
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
