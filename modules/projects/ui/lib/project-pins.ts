/**
 * Per-user project pins (`projects.pins.v1`). A pinned project is listed on
 * the Work sidebar and the Space home of the space it lives in — see
 * `space-sections.ts`. Pinning is personal nav: nothing on the project changes.
 */
import { requestApiJson } from "@engenty/api-client";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { useCallback } from "react";

export const PROJECT_PINS_SETTING_KEY = "projects.pins.v1";

export interface ProjectPinsDocument {
  project_ids: string[];
  version: 1;
}

const EMPTY_PINS: ProjectPinsDocument = { project_ids: [], version: 1 };

const SETTING_PATH = `/api/user-settings/${encodeURIComponent(PROJECT_PINS_SETTING_KEY)}`;

export const projectPinsQueryKey = [
  "user-settings",
  PROJECT_PINS_SETTING_KEY,
] as const;

function parseProjectPins(value: unknown): ProjectPinsDocument {
  if (
    typeof value === "object" &&
    value !== null &&
    "project_ids" in value &&
    Array.isArray(value.project_ids)
  ) {
    return {
      project_ids: value.project_ids.filter(
        (id): id is string => typeof id === "string"
      ),
      version: 1,
    };
  }
  return EMPTY_PINS;
}

export function projectPinsQueryOptions() {
  return queryOptions({
    queryKey: projectPinsQueryKey,
    queryFn: async ({ signal }) => {
      const res = await requestApiJson<{ value: unknown }>(SETTING_PATH, {
        method: "GET",
        signal,
      });
      return parseProjectPins(res.value);
    },
    staleTime: 30_000,
  });
}

export function useProjectPins() {
  const query = useQuery(projectPinsQueryOptions());
  return {
    isPending: query.isPending,
    projectIds: query.data?.project_ids ?? EMPTY_PINS.project_ids,
  };
}

export function useToggleProjectPin(projectId: string) {
  const queryClient = useQueryClient();
  const { projectIds } = useProjectPins();
  const isPinned = projectIds.includes(projectId);

  const mutation = useMutation({
    mutationFn: async (next: ProjectPinsDocument) => {
      await requestApiJson(SETTING_PATH, {
        method: "PATCH",
        body: { type: "json", value_jsonb: next },
      });
      return next;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: projectPinsQueryKey });
      const previous =
        queryClient.getQueryData<ProjectPinsDocument>(projectPinsQueryKey);
      queryClient.setQueryData(projectPinsQueryKey, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      queryClient.setQueryData(
        projectPinsQueryKey,
        context?.previous ?? EMPTY_PINS
      );
    },
  });

  const toggle = useCallback(() => {
    const current =
      queryClient.getQueryData<ProjectPinsDocument>(projectPinsQueryKey) ??
      EMPTY_PINS;
    const pinned = current.project_ids.includes(projectId);
    mutation.mutate({
      project_ids: pinned
        ? current.project_ids.filter((id) => id !== projectId)
        : [...current.project_ids, projectId],
      version: 1,
    });
  }, [mutation, projectId, queryClient]);

  return { isPinned, toggle };
}
