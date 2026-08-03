import {
  keepPreviousData,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type {
  GoalCreateInput,
  GoalsQueryParams,
  GoalUpdateInput,
  TaskCreateInput,
  TaskSettingsUpdateInput,
  TasksBriefingMode,
  TasksQueryParams,
  TaskUpdateInput,
} from "../src/schema/types.js";
import {
  addTaskComment,
  createGoal,
  createTask,
  deleteGoal,
  deleteTask,
  getGoal,
  getGoals,
  getTask,
  getTaskActivity,
  getTaskRuns,
  getTaskSettings,
  getTasks,
  getTasksBriefing,
  getUserDisplayName,
  handoffGoalToCoordinator,
  type ResolveToolApprovalBody,
  releaseTask,
  resolveTaskToolApproval,
  revokeTaskApprovalGrant,
  updateGoal,
  updateTask,
  updateTaskSettings,
} from "./api.js";
import { fetchTaskLinkedSessions } from "./lib/task-linked-sessions.js";
import { TASK_LIVE_POLL_MS } from "./lib/task-run-live.js";

export function invalidateTaskDetailLiveQueries(
  queryClient: QueryClient,
  taskId: string
) {
  void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
  void queryClient.invalidateQueries({ queryKey: taskKeys.runs(taskId) });
  void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
}

export const taskKeys = {
  all: ["tasks"] as const,
  list: (params: TasksQueryParams) =>
    [...taskKeys.all, "list", params] as const,
  detail: (id: string) => [...taskKeys.all, "detail", id] as const,
  runs: (id: string) => [...taskKeys.all, "runs", id] as const,
  activity: (id: string) => [...taskKeys.all, "activity", id] as const,
  linkedSessions: (id: string, workspaceKey: string) =>
    [...taskKeys.all, "linked-sessions", id, workspaceKey] as const,
  settings: () => [...taskKeys.all, "settings"] as const,
  briefing: (mode: TasksBriefingMode) =>
    [...taskKeys.all, "briefing", mode] as const,
  userProfile: (userId: string) =>
    [...taskKeys.all, "user-profile", userId] as const,
  goals: {
    all: ["tasks", "goals"] as const,
    list: (params: GoalsQueryParams) =>
      [...taskKeys.goals.all, "list", params] as const,
    detail: (id: string) => [...taskKeys.goals.all, "detail", id] as const,
  },
};

export function tasksListOptions(params: TasksQueryParams) {
  return queryOptions({
    queryKey: taskKeys.list(params),
    queryFn: ({ signal }) => getTasks(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useTasksListQuery(params: TasksQueryParams) {
  return useQuery(tasksListOptions(params));
}

export function taskDetailOptions(id: string) {
  return queryOptions({
    queryKey: taskKeys.detail(id),
    queryFn: ({ signal }) => getTask(id, signal),
  });
}

export function useTaskDetailQuery(
  id: string | null,
  livePollWhen?: () => boolean
) {
  return useQuery({
    ...taskDetailOptions(id ?? ""),
    enabled: !!id,
    refetchInterval: () => (livePollWhen?.() ? TASK_LIVE_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function useTaskRunsQuery(
  id: string | null,
  livePollWhen?: () => boolean
) {
  return useQuery({
    queryKey: taskKeys.runs(id ?? ""),
    queryFn: ({ signal }) => getTaskRuns(id ?? "", signal),
    enabled: !!id,
    refetchInterval: () => (livePollWhen?.() ? TASK_LIVE_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function useTaskActivityQuery(
  id: string | null,
  livePollWhen?: () => boolean
) {
  return useQuery({
    queryKey: taskKeys.activity(id ?? ""),
    queryFn: ({ signal }) => getTaskActivity(id ?? "", signal),
    enabled: !!id,
    refetchInterval: () => (livePollWhen?.() ? TASK_LIVE_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function taskLinkedSessionsOptions(
  taskId: string,
  workspaceKey: string
) {
  return queryOptions({
    queryKey: taskKeys.linkedSessions(taskId, workspaceKey),
    queryFn: ({ signal }) =>
      fetchTaskLinkedSessions({
        limit: 5,
        signal,
        taskId,
        workspaceKey,
      }),
    enabled: Boolean(taskId && workspaceKey),
    staleTime: 30_000,
  });
}

export function useTaskLinkedSessionsQuery(
  taskId: string | null,
  workspaceKey: string | null
) {
  return useQuery({
    ...taskLinkedSessionsOptions(taskId ?? "", workspaceKey ?? ""),
    enabled: Boolean(taskId && workspaceKey),
  });
}

export function goalsListOptions(params: GoalsQueryParams) {
  return queryOptions({
    queryKey: taskKeys.goals.list(params),
    queryFn: ({ signal }) => getGoals(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useGoalsListQuery(params: GoalsQueryParams) {
  return useQuery(goalsListOptions(params));
}

export function goalDetailOptions(id: string) {
  return queryOptions({
    queryKey: taskKeys.goals.detail(id),
    queryFn: ({ signal }) => getGoal(id, signal),
  });
}

export function useGoalDetailQuery(id: string | null) {
  return useQuery({
    ...goalDetailOptions(id ?? ""),
    enabled: !!id,
  });
}

export function useTaskSettingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: taskKeys.settings(),
    queryFn: ({ signal }) => getTaskSettings(signal),
    ...options,
  });
}

export function useUpdateTaskSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskSettingsUpdateInput) => updateTaskSettings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.settings() });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function tasksBriefingOptions(mode: TasksBriefingMode) {
  return queryOptions({
    queryKey: taskKeys.briefing(mode),
    queryFn: ({ signal }) => getTasksBriefing(mode, signal),
  });
}

export function useTasksBriefingQuery(mode: TasksBriefingMode) {
  return useQuery(tasksBriefingOptions(mode));
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreateInput) => createTask(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useUpdateTaskMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskUpdateInput) => updateTask(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(id) });
    },
  });
}

export function useUpdateTasksListMutation(_listParams: TasksQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string;
      input: TaskUpdateInput;
    }) => updateTask(taskId, input),
    onSuccess: (_, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    },
  });
}

export function useAddTaskCommentMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => addTaskComment(taskId, content),
    onSuccess: () => {
      invalidateTaskDetailLiveQueries(queryClient, taskId);
    },
  });
}

export function useReleaseTaskMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: { agent_session_run_id?: string }) =>
      releaseTask(taskId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      invalidateTaskDetailLiveQueries(queryClient, taskId);
    },
  });
}

export function useResolveToolApprovalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      body,
    }: {
      taskId: string;
      body: ResolveToolApprovalBody;
    }) => resolveTaskToolApproval(taskId, body),
    onSuccess: (_, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      invalidateTaskDetailLiveQueries(queryClient, taskId);
    },
  });
}

export function useRevokeApprovalGrantMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (operationId: string) =>
      revokeTaskApprovalGrant(taskId, operationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      invalidateTaskDetailLiveQueries(queryClient, taskId);
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useBulkDeleteTasksMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      await Promise.all(taskIds.map((id) => deleteTask(id)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useBulkUpdateTasksMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskIds,
      input,
    }: {
      taskIds: string[];
      input: TaskUpdateInput;
    }) => {
      await Promise.all(taskIds.map((id) => updateTask(id, input)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCreateGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalCreateInput) => createGoal(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.goals.all });
    },
  });
}

export function useUpdateGoalMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalUpdateInput) => updateGoal(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.goals.all });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.goals.detail(id),
      });
    },
  });
}

export function useDeleteGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => deleteGoal(goalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.goals.all });
    },
  });
}

export function useHandoffGoalMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => handoffGoalToCoordinator(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.goals.all });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.goals.detail(id),
      });
      // The coordinator creates tasks under the goal; refresh their list.
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCurrentUserDisplayNameQuery(userId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: userId
        ? taskKeys.userProfile(userId)
        : (["tasks", "user-profile", null] as const),
      queryFn: ({ signal }) =>
        userId ? getUserDisplayName(userId, signal) : null,
      enabled: !!userId,
      staleTime: 5 * 60_000,
    })
  );
}
