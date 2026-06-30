import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { getGoals } from "./api.js";
import {
  getDispatchStatus,
  getRoutinesList,
  runRoutineNow,
} from "./lib/operations-api.js";

export const operationsKeys = {
  all: ["tasks", "operations"] as const,
  dispatch: () => [...operationsKeys.all, "dispatch"] as const,
  coordinator: () => [...operationsKeys.all, "coordinator"] as const,
  activeGoals: () => [...operationsKeys.all, "active-goals"] as const,
};

export function dispatchStatusOptions() {
  return queryOptions({
    queryKey: operationsKeys.dispatch(),
    queryFn: ({ signal }) => getDispatchStatus(signal),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function coordinatorStatusOptions() {
  return queryOptions({
    queryKey: operationsKeys.coordinator(),
    queryFn: async ({ signal }) => {
      const { routines } = await getRoutinesList(signal);
      return (
        routines.find((r) => r.id === "engenty-coordinator.heartbeat") ?? null
      );
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function activeGoalsOptions() {
  return queryOptions({
    queryKey: operationsKeys.activeGoals(),
    queryFn: ({ signal }) => getGoals({ status: "active" }, signal),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useRunCoordinatorNowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runRoutineNow("engenty-coordinator.heartbeat"),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: operationsKeys.coordinator(),
      });
    },
  });
}
