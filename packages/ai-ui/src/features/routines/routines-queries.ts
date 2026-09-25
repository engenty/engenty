import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { cancelWorkflowRun } from "../workflow-canvas/workflow-api.js";
import {
  type CustomRoutineInput,
  createCustomRoutine,
  createRoutineOutcome,
  createRoutineTrigger,
  deleteCustomRoutine,
  deleteRoutineOutcome,
  deleteRoutineTrigger,
  listOutcomeProviders,
  listRoutineRuns,
  listRoutines,
  patchRoutineState,
  type RoutineOutcomeInput,
  type RoutineTriggerInput,
  runRoutineNow,
  updateCustomRoutine,
  updateRoutineOutcome,
  updateRoutineTrigger,
} from "./routines-api.js";

export const routinesKeys = {
  all: ["routines"] as const,
  /**
   * The space is part of the key: two spaces hold different routines, and a
   * shared key would serve one space's list to the other out of the cache.
   * `list()` with no argument stays a valid PREFIX, so the mutations below can
   * keep invalidating every space at once.
   */
  list: (spaceId?: string) =>
    spaceId
      ? ([...routinesKeys.all, "list", spaceId] as const)
      : ([...routinesKeys.all, "list"] as const),
  outcomeProviders: ["routines", "outcome-providers"] as const,
  runNow: () => [...routinesKeys.all, "run-now"] as const,
  runs: (routineId: string) =>
    [...routinesKeys.all, "runs", routineId] as const,
};

export function routinesListOptionsFor(spaceId?: string) {
  return queryOptions({
    queryKey: routinesKeys.list(spaceId),
    queryFn: ({ signal }) => listRoutines(signal, spaceId),
    staleTime: 10_000,
  });
}

/** Tenant-wide options, for prefetching outside a space. */
export const routinesListOptions = routinesListOptionsFor();

/**
 * Routines are space-scoped by default — a routine belongs to the space it was
 * created in (PLAN-spaces.md Phase 6), so the list at `/s/marketing/…` must not
 * show Company's. Scoping lives here rather than at the six call sites for the
 * same reason the tasks hooks scope centrally: a filter each caller has to
 * remember is a filter half of them forget.
 *
 * Pass `scope: "tenant"` for surfaces that are about the PERSON or the whole
 * tenant rather than about one space.
 */
export function useRoutinesListQuery(
  livePoll = false,
  scope: "current" | "tenant" = "current"
) {
  const { currentSpace } = useWorkspaceContext();
  // No space (outside the shell, or a tenant predating the backfill) means "do
  // not filter" — a bogus id would empty the list instead.
  const spaceId = scope === "tenant" ? undefined : currentSpace?.id;
  return useQuery({
    ...routinesListOptionsFor(spaceId),
    refetchInterval: livePoll ? 5000 : false,
    refetchIntervalInBackground: false,
  });
}

/** This routine's past fires. Polls while a run is in flight. */
export function useRoutineRunsQuery(
  routineId: string | null,
  livePoll = false
) {
  return useQuery({
    enabled: Boolean(routineId),
    queryFn: ({ signal }) => listRoutineRuns(routineId as string, 20, signal),
    queryKey: routinesKeys.runs(routineId ?? ""),
    refetchInterval: livePoll ? 5000 : false,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  });
}

export function usePatchRoutineStateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    // Exactly what `patchRoutineState` sends. The input used to advertise a
    // `schedule_override` the request never carried, so a caller that set it
    // got a silent no-op.
    mutationFn: (input: { id: string; patch: { enabled?: boolean } }) =>
      patchRoutineState(input.id, input.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useRunRoutineNowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runRoutineNow(id),
    // Keyed so a fire from the pane's menu and from the page's button read
    // as one: the page shows why the last fire was skipped either way.
    mutationKey: routinesKeys.runNow(),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
      void queryClient.invalidateQueries({ queryKey: routinesKeys.runs(id) });
      void queryClient.invalidateQueries({ queryKey: ["ai-runtime", "runs"] });
      void queryClient.invalidateQueries({
        queryKey: ["ai-runtime", "admin-sessions"],
      });
    },
  });
}

export function useCreateCustomRoutineMutation() {
  const queryClient = useQueryClient();
  const { currentSpace } = useWorkspaceContext();
  return useMutation({
    // A routine created inside a space belongs to it. Defaulting here rather
    // than in each dialog keeps the create path symmetric with the list above;
    // an explicit `space_id` from the caller still wins.
    mutationFn: (body: CustomRoutineInput) =>
      createCustomRoutine(
        body.space_id || !currentSpace?.id
          ? body
          : { ...body, space_id: currentSpace.id }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useUpdateCustomRoutineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: Partial<CustomRoutineInput> }) =>
      updateCustomRoutine(input.id, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useDeleteCustomRoutineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomRoutine(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useCreateRoutineTriggerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { routineId: string; body: RoutineTriggerInput }) =>
      createRoutineTrigger(input.routineId, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useUpdateRoutineTriggerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      body: Partial<RoutineTriggerInput>;
      routineId: string;
      triggerId: string;
    }) => updateRoutineTrigger(input.routineId, input.triggerId, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useDeleteRoutineTriggerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { routineId: string; triggerId: string }) =>
      deleteRoutineTrigger(input.routineId, input.triggerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useOutcomeProvidersQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) => listOutcomeProviders(signal),
    queryKey: routinesKeys.outcomeProviders,
    staleTime: 60_000,
  });
}

export function useCreateRoutineOutcomeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: RoutineOutcomeInput; routineId: string }) =>
      createRoutineOutcome(input.routineId, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useUpdateRoutineOutcomeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      body: Partial<RoutineOutcomeInput>;
      outcomeId: string;
      routineId: string;
    }) => updateRoutineOutcome(input.routineId, input.outcomeId, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useDeleteRoutineOutcomeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { outcomeId: string; routineId: string }) =>
      deleteRoutineOutcome(input.routineId, input.outcomeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

/** Stop a routine's open run, so its next start is not skipped as overlap. */
export function useCancelRoutineRunMutation(routineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => cancelWorkflowRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: routinesKeys.runs(routineId),
      });
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}
