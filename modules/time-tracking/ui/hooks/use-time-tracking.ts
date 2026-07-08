import { useQuery, useQueryClient } from "@engenty/query-client";
import { format, startOfWeek } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getProjectsCatalog,
  getTeamMembersCatalog,
  getTimeTrackingContext,
  getTimeTrackingWeek,
  type ProjectOption,
  type TeamMemberOption,
} from "../api.js";
import type { Discipline } from "../components/types.js";

const DEFAULT_DISCIPLINES: Discipline[] = [
  { name: "General", short: "GEN" },
  { name: "Design", short: "DES" },
  { name: "Development", short: "DEV" },
];

/** Root for the time-tracking week query; live-cache invalidates this prefix. */
export const timeTrackingKeys = {
  all: ["time-tracking"] as const,
  week: (userId: string, weekStart: string) =>
    [...timeTrackingKeys.all, "week", userId, weekStart] as const,
};

export function useTimeTracking(selectedUser: string, currentWeek: Date) {
  const queryClient = useQueryClient();
  // Reference data (not realtime-driven) stays on local state.
  const [currentUser, setCurrentUser] = useState<TeamMemberOption | null>(null);
  const [users, setUsers] = useState<TeamMemberOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [disciplines] = useState<Discipline[]>(DEFAULT_DISCIPLINES);
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([]);
  const [projectsAvailable, setProjectsAvailable] = useState(false);
  const [tasksAvailable, setTasksAvailable] = useState(false);
  const [teamMembersAvailable, setTeamMembersAvailable] = useState(false);

  const weekStart = useMemo(
    () => startOfWeek(currentWeek, { weekStartsOn: 1 }),
    [currentWeek]
  );
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const effectiveUserId = selectedUser || currentUser?.id || "";

  const loadBootstrap = useCallback(async (cancelled: () => boolean) => {
    const context = await getTimeTrackingContext();
    if (cancelled()) {
      return;
    }

    const self: TeamMemberOption = {
      id: context.current_user.id,
      full_name: context.current_user.full_name,
      user_id: context.current_user.id,
    };

    setIsAdmin(context.is_admin);
    setProjectsAvailable(context.projects_available);
    setTasksAvailable(context.tasks_available);
    setTeamMembersAvailable(context.team_available);
    setCurrentUser(self);

    if (context.team_available && context.is_admin) {
      const members = await getTeamMembersCatalog();
      if (!cancelled()) {
        setUsers(members.length > 0 ? members : [self]);
      }
    } else if (!cancelled()) {
      setUsers([self]);
    }

    if (context.projects_available) {
      const projects = await getProjectsCatalog();
      if (!cancelled()) {
        setAllProjects(projects);
      }
    } else if (!cancelled()) {
      setAllProjects([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    setContextReady(false);
    setContextError(null);
    setReferenceLoading(true);

    loadBootstrap(isCancelled)
      .catch((error) => {
        if (!cancelled) {
          setContextError(
            error instanceof Error
              ? error.message
              : "Failed to load time tracking context."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setContextReady(true);
          setReferenceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadBootstrap]);

  // Week data on React Query so it joins the global live-cache (a time_entries
  // change anywhere invalidates ["time-tracking"] and refetches here).
  const weekQuery = useQuery({
    queryKey: timeTrackingKeys.week(effectiveUserId, weekStartStr),
    queryFn: () => getTimeTrackingWeek(weekStartStr, effectiveUserId),
    enabled: contextReady && Boolean(effectiveUserId),
  });

  const refetchWeek = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: timeTrackingKeys.all });
  }, [queryClient]);

  const isLoading =
    !contextReady ||
    referenceLoading ||
    (Boolean(effectiveUserId) && weekQuery.isLoading);

  return {
    trackingRows: weekQuery.data?.rows ?? [],
    timeEntries: weekQuery.data?.entries ?? [],
    currentUser,
    users,
    isAdmin,
    isLoading,
    loadError:
      contextError ??
      (weekQuery.error instanceof Error
        ? weekQuery.error.message
        : weekQuery.error
          ? "Failed to load time tracking data."
          : null),
    disciplines,
    allProjects,
    projectsAvailable,
    tasksAvailable,
    teamMembersAvailable,
    refetchTrackingRows: refetchWeek,
    refetchTimeEntries: refetchWeek,
  };
}
