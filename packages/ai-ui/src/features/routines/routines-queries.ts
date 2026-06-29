import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  type CustomRoutineInput,
  createCustomRoutine,
  deleteCustomRoutine,
  listRoutines,
  patchRoutineState,
  runRoutineNow,
  updateCustomRoutine,
} from "./routines-api.js";

export const routinesKeys = {
  all: ["routines"] as const,
  list: () => [...routinesKeys.all, "list"] as const,
};

export const routinesListOptions = queryOptions({
  queryKey: routinesKeys.list(),
  queryFn: ({ signal }) => listRoutines(signal),
  staleTime: 10_000,
});

export function useRoutinesListQuery(livePoll = false) {
  return useQuery({
    ...routinesListOptions,
    refetchInterval: livePoll ? 5000 : false,
    refetchIntervalInBackground: false,
  });
}

export function usePatchRoutineStateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      patch: { enabled?: boolean; schedule_override?: string | null };
    }) => patchRoutineState(input.id, input.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
    },
  });
}

export function useRunRoutineNowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runRoutineNow(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routinesKeys.list() });
      void queryClient.invalidateQueries({ queryKey: ["ai-runtime", "runs"] });
      void queryClient.invalidateQueries({
        queryKey: ["ai-runtime", "admin-sessions"],
      });
    },
  });
}

export function useCreateCustomRoutineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomRoutineInput) => createCustomRoutine(body),
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
