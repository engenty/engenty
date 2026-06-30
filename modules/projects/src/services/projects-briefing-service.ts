import { addDays, startOfDay } from "date-fns";
import type { createProjectRepoSupabase } from "../dal/supabase.js";
import type {
  BriefingAttentionItem,
  BriefingStaleItem,
  BriefingSuggestedAction,
  BriefingTaskItem,
  BriefingWaitingItem,
  PhaseTask,
  ProjectSettings,
  ProjectsBriefingMode,
  ProjectsBriefingResponse,
  ProjectTaskListItem,
} from "../schema/types.js";

type ProjectRepo = ReturnType<typeof createProjectRepoSupabase>;

function isOpenTask(status: PhaseTask["status"]): boolean {
  return status !== "done" && status !== "cancelled";
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function taskToFocusItem(
  t: ProjectTaskListItem,
  reason: string
): BriefingTaskItem {
  return {
    id: t.id,
    project_id: t.project_id,
    project_title: t.project_title,
    reason,
    status: t.status,
    title: t.title,
    updated_at: t.updated_at,
  };
}

export async function buildProjectsBriefingResponse(
  repo: ProjectRepo,
  settings: ProjectSettings,
  principalId: string | undefined,
  mode: ProjectsBriefingMode
): Promise<ProjectsBriefingResponse> {
  const overdueDays = settings.briefing_overdue_days;
  const staleCutoff = addDays(
    startOfDay(new Date()),
    -overdueDays
  ).toISOString();
  const weekEnd = addDays(startOfDay(new Date()), 7);
  const today = toIsoDate(startOfDay(new Date()));
  const weekEndStr = toIsoDate(weekEnd);

  const [projectsPage, allTasksPage, mineTasksPage] = await Promise.all([
    repo.listPaginated({ page: 1, pageSize: 200 }),
    repo.listTasksPaginated(
      {
        page: 1,
        pageSize: 200,
        scope: mode === "oversight" ? "all" : "all",
        sortBy: "updated_at",
        sortOrder: "desc",
      },
      undefined
    ),
    principalId
      ? repo.listTasksPaginated(
          {
            page: 1,
            pageSize: 100,
            scope: "mine",
            sortBy: "updated_at",
            sortOrder: "desc",
          },
          principalId
        )
      : Promise.resolve({
          data: [] as ProjectTaskListItem[],
          total: 0,
          page: 1,
          pageSize: 100,
        }),
  ]);

  const projectById = new Map(projectsPage.data.map((p) => [p.id, p]));
  const soonProjectIds = new Set(
    projectsPage.data
      .filter((p) => {
        if (!p.end_date) {
          return false;
        }
        return p.end_date >= today && p.end_date <= weekEndStr;
      })
      .map((p) => p.id)
  );

  const allOpen = allTasksPage.data.filter((t) => isOpenTask(t.status));
  const mineOpen = mineTasksPage.data.filter((t) => isOpenTask(t.status));

  const focusSource = mode === "personal" && principalId ? mineOpen : allOpen;
  const focusItems: BriefingTaskItem[] = focusSource
    .filter((t) => soonProjectIds.has(t.project_id))
    .slice(0, 12)
    .map((t) =>
      taskToFocusItem(
        t,
        projectById.get(t.project_id)?.end_date
          ? "Project due date within 7 days"
          : "Active work"
      )
    );

  if (focusItems.length < 8 && mode === "personal" && principalId) {
    const extra = mineOpen
      .filter((t) => !focusItems.some((f) => f.id === t.id))
      .slice(0, 8 - focusItems.length)
      .map((t) => taskToFocusItem(t, "Your open tasks"));
    focusItems.push(...extra);
  } else if (focusItems.length < 8 && mode === "oversight") {
    const extra = allOpen
      .filter((t) => !focusItems.some((f) => f.id === t.id))
      .slice(0, 8 - focusItems.length)
      .map((t) => taskToFocusItem(t, "Open work across projects"));
    focusItems.push(...extra);
  }

  const attentionItems: BriefingAttentionItem[] = [];
  for (const t of allOpen) {
    const assignees = t.task_team?.length ?? 0;
    if (assignees === 0) {
      attentionItems.push({
        id: t.id,
        project_id: t.project_id,
        project_title: t.project_title,
        reason: "No assignee",
        title: t.title,
      });
    }
  }
  for (const t of allOpen) {
    if (t.status === "request") {
      if (attentionItems.some((a) => a.id === t.id)) {
        continue;
      }
      attentionItems.push({
        id: t.id,
        project_id: t.project_id,
        project_title: t.project_title,
        reason: "Waiting / review (request status)",
        title: t.title,
      });
    }
  }
  for (const t of allOpen) {
    const proj = projectById.get(t.project_id);
    if (proj?.end_date && proj.end_date < today) {
      if (attentionItems.some((a) => a.id === t.id)) {
        continue;
      }
      attentionItems.push({
        id: t.id,
        project_id: t.project_id,
        project_title: t.project_title,
        reason: "Project end date passed",
        title: t.title,
      });
    }
  }

  const waiting_items: BriefingWaitingItem[] = allOpen
    .filter((t) => t.status === "request")
    .slice(0, 25)
    .map((t) => ({
      id: t.id,
      project_id: t.project_id,
      project_title: t.project_title,
      reason: "Task is in request / waiting state",
      title: t.title,
    }));

  const stale_items: BriefingStaleItem[] = allOpen
    .filter((t) => t.updated_at < staleCutoff)
    .slice(0, 25)
    .map((t) => ({
      id: t.id,
      project_id: t.project_id,
      project_title: t.project_title,
      reason: `No update for ${overdueDays}+ days`,
      title: t.title,
    }));

  const suggested_actions: BriefingSuggestedAction[] = [
    { id: "view-tasks", label: "Plan my week", href: "/mdl/projects/tasks" },
    {
      id: "view-blockers",
      label: "Show blockers",
      href: "/mdl/projects/tasks?status=request",
    },
    {
      id: "view-updates",
      label: "View updates",
      href: "/mdl/projects/updates",
    },
  ];

  const dueThisWeek =
    mode === "personal" && principalId
      ? mineOpen.filter((t) => soonProjectIds.has(t.project_id)).length
      : allOpen.filter((t) => soonProjectIds.has(t.project_id)).length;

  const blocked = allOpen.filter((t) => t.status === "request").length;

  return {
    mode,
    overdue_days: overdueDays,
    summary: {
      due_this_week: dueThisWeek,
      blocked_items: blocked,
      waiting_items: waiting_items.length,
      stale_items: stale_items.length,
    },
    focus_items: focusItems.slice(0, 12),
    attention_items: attentionItems.slice(0, 20),
    waiting_items,
    stale_items,
    suggested_actions,
  };
}
