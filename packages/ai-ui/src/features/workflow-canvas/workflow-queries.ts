import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type { StoredGraph } from "./graph-model.js";
import {
  createWorkflow,
  deleteWorkflow,
  draftWorkflow,
  getWorkflow,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflows,
  materializeWorkflow,
  publishWorkflowVersion,
  reconcileModuleWorkflows,
  repairWorkflow,
  resumeWorkflowRun,
  reviewWorkflowRun,
  runWorkflow,
  saveWorkflowVersion,
  updateWorkflow,
  validateWorkflow,
  type WorkflowVersionDto,
} from "./workflow-api.js";

export const workflowKeys = {
  all: ["workflows"] as const,
  detail: (id: string) => [...workflowKeys.all, "detail", id] as const,
  list: (contextType?: string | null) =>
    [...workflowKeys.all, "list", contextType ?? "*"] as const,
};

export function workflowListOptions(contextType?: string | null) {
  return queryOptions({
    queryFn: ({ signal }) => listWorkflows(contextType, signal),
    queryKey: workflowKeys.list(contextType),
    staleTime: 10_000,
  });
}

export function useWorkflowListQuery(contextType?: string | null) {
  return useQuery(workflowListOptions(contextType));
}

export function useWorkflowQuery(id: string | undefined) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: ({ signal }) => getWorkflow(id as string, signal),
    queryKey: workflowKeys.detail(id ?? ""),
    staleTime: 5000,
  });
}

/**
 * Live validation for the canvas. Keyed on the graph itself so an edit
 * revalidates and an undo returns to the cached result instead of re-asking.
 */
export function useGraphValidationQuery(
  graph: StoredGraph | null,
  enabled = true
) {
  return useQuery({
    enabled: Boolean(graph) && enabled,
    queryFn: ({ signal }) => validateWorkflow(graph as StoredGraph, signal),
    // The graph JSON is the cache key: identical graphs never re-validate.
    queryKey: ["workflows", "validate", JSON.stringify(graph ?? {})],
    staleTime: 60_000,
  });
}

export function useCreateWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useDraftWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: draftWorkflow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useRepairWorkflowMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof repairWorkflow>[1]) =>
      repairWorkflow(id, input),
    onSuccess: () => {
      // The detail query carries the version list — the repaired v(N+1) has
      // to show up in the picker without a reload.
      void queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(id),
      });
    },
  });
}

export function useUpdateWorkflowMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateWorkflow>[1]) =>
      updateWorkflow(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useDeleteWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useSaveVersionMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation<
    { version: WorkflowVersionDto },
    Error,
    {
      allowed_tools?: string[] | null;
      authored_by?: "user" | "copilot";
      graph: StoredGraph;
    }
  >({
    mutationFn: (input) => saveWorkflowVersion(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(id),
      });
    },
  });
}

export function usePublishVersionMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => publishWorkflowVersion(id, versionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

/**
 * Compile a declared module workflow into its stored graph, so it can be TARGETED before anyone
 * has pressed it. Invalidates the graph list: the module workflow stops being a
 * "declared" catalog row and becomes a real published graph.
 */
export function useMaterializeWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => materializeWorkflow(workflowId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() });
    },
  });
}

/**
 * Re-read the module workflow files and republish what changed.
 *
 * Everything is invalidated rather than one row: the pass republishes any
 * module workflow that drifted, so which rows moved is not knowable here.
 */
export function useReconcileModuleWorkflowsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reconcileModuleWorkflows(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useRunWorkflowMutation(id: string) {
  return useMutation({
    mutationFn: (input: Parameters<typeof runWorkflow>[1]) =>
      runWorkflow(id, input),
  });
}

export function useResumeRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      runId: string;
      approved: boolean;
      data?: Record<string, unknown>;
      reason?: string;
      step_id?: string;
    }) => {
      const { runId, ...rest } = input;
      return resumeWorkflowRun(runId, rest);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useReviewRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => reviewWorkflowRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useWorkflowRunsQuery(id: string | undefined) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: ({ signal }) => listWorkflowRuns(id as string, signal),
    queryKey: [...workflowKeys.detail(id ?? ""), "runs"],
    staleTime: 5000,
  });
}

/**
 * One run's state. Polls while the run is still moving — a running node and a
 * pending gate are the two things a watcher actually wants live. Settled runs
 * stop polling, because a finished run never changes again.
 */
export function useWorkflowRunQuery(runId: string | undefined) {
  return useQuery({
    enabled: Boolean(runId),
    queryFn: ({ signal }) => getWorkflowRun(runId as string, signal),
    queryKey: ["workflows", "run", runId ?? ""],
    refetchInterval: (query) => {
      const snapshot = query.state.data?.snapshot;
      // No snapshot yet = the background dispatch hasn't persisted one — a
      // just-pressed run always starts here. Returning false at this point
      // froze the very first fetch's answer and left the button "running"
      // forever; keep polling until a snapshot exists to judge.
      if (!snapshot) {
        return 2000;
      }
      const status = snapshot.status;
      return status === "running" || status === "waiting" ? 2000 : false;
    },
    staleTime: 1000,
  });
}
