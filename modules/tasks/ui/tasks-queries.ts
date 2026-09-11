import {
  beginOptimisticUpdate,
  keepPreviousData,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  Task,
  TaskDetail,
  TaskSettings,
  TaskSettingsUpdateInput,
  TasksBriefingMode,
  TasksQueryParams,
  TaskUpdateInput,
} from "../src/schema/types.js";
import {
  addTaskComment,
  getTask,
  getTaskActivity,
  getTaskRuns,
  getTaskSettings,
  getTasks,
  getTasksBriefing,
  getUserDisplayName,
  type ResolveToolApprovalBody,
  releaseTask,
  resolveTaskToolApproval,
  revokeTaskApprovalGrant,
  runTaskNow,
  updateTask,
  updateTaskSettings,
} from "./api.js";
import { fetchTaskLinkedSessions } from "./lib/task-linked-sessions.js";
import { patchTask, patchTaskSettings } from "./lib/task-optimistic-cache.js";
import { TASK_LIVE_POLL_MS } from "./lib/task-run-live.js";
import {
  type TaskSpaceScope,
  useTaskSpaceScope,
  withTaskSpaceScope,
} from "./lib/use-task-space-scope.js";

// biome-ignore lint/performance/noBarrelFile: preserve established query-hook imports
export {
  useBulkDeleteTasksMutation,
  useBulkUpdateTasksMutation,
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useUpdateTasksListMutation,
} from "./complex-optimistic-mutations.js";

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
  briefing: (mode: TasksBriefingMode, spaceId?: string) =>
    [...taskKeys.all, "briefing", mode, spaceId ?? null] as const,
  userProfile: (userId: string) =>
    [...taskKeys.all, "user-profile", userId] as const,
};

export function tasksListOptions(params: TasksQueryParams) {
  return queryOptions({
    queryKey: taskKeys.list(params),
    queryFn: ({ signal }) => getTasks(params, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Space-scoped by default (PLAN-spaces.md Phase 5/6): the list shows the space
 * the user is in. Pass `scope: "tenant"` for a surface that is about a person or
 * the whole tenant rather than about this space, and `space_id` in the params to
 * pin a specific one — an explicit id always wins.
 */
export function useTasksListQuery(
  params: TasksQueryParams,
  options: { scope?: TaskSpaceScope } = {}
) {
  const spaceId = useTaskSpaceScope(options.scope);
  return useQuery(tasksListOptions(withTaskSpaceScope(params, spaceId)));
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
    onMutate: async (input) => {
      const transaction = await beginOptimisticUpdate<TaskSettings>(
        queryClient,
        {
          queryKey: taskKeys.settings(),
          update: (current) => patchTaskSettings(current, input),
        }
      );
      return { transaction };
    },
    onError: (_error, _input, context) => {
      context?.transaction.rollback();
      toast.error("Could not save task settings.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(taskKeys.settings(), saved);
    },
  });
}

export function tasksBriefingOptions(
  mode: TasksBriefingMode,
  spaceId?: string
) {
  return queryOptions({
    // The space belongs in the key: without it, walking from one space to
    // another would show the previous space's briefing from cache.
    queryKey: taskKeys.briefing(mode, spaceId),
    queryFn: ({ signal }) => getTasksBriefing(mode, spaceId, signal),
  });
}

export function useTasksBriefingQuery(
  mode: TasksBriefingMode,
  options: { scope?: TaskSpaceScope } = {}
) {
  const spaceId = useTaskSpaceScope(options.scope);
  return useQuery(tasksBriefingOptions(mode, spaceId));
}

export function useUpdateTaskMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskUpdateInput) => updateTask(id, input),
    onMutate: async (input) => {
      const transaction = await beginOptimisticUpdate<Task>(queryClient, {
        queryKey: taskKeys.detail(id),
        update: (current) => patchTask(current, input),
      });
      return { transaction };
    },
    onError: (_error, _input, context) => {
      context?.transaction.rollback();
      toast.error("Could not save the task.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<TaskDetail | undefined>(
        taskKeys.detail(id),
        (current) => (current ? { ...current, ...saved } : current)
      );
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(id) });
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

/**
 * Answer an agent's question and let it carry on.
 *
 * Two calls, deliberately in this order and not merged into one op: the reply
 * is a plain comment (so it reads like any other, and survives if the dispatch
 * fails), and the dispatch is the same `run now` a person could press by hand.
 * The agent sees the answer because the brief replays prior comments.
 */
export function useAnswerTaskQuestionMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      await addTaskComment(taskId, content);
      return await runTaskNow(taskId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
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
