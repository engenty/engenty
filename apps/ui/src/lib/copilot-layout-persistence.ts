import {
  COPILOT_LAYOUT_USER_SETTING_NAME,
  type CopilotLayoutSnapshotV1,
  createEmptyCopilotLayoutSnapshot,
  mergeCopilotLayoutSnapshot,
  parseCopilotLayoutSnapshot,
} from "@engenty/ai-ui";
import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import { useCallback, useMemo, useRef } from "react";
import { getUserSetting, setUserSetting } from "@/lib/api/client";

/** User-settings `copilot.layout`: auto-saved when you snap/drag the shell or use the ⋮ position menu (not Appearance settings). */

export const copilotLayoutQueryKey = [
  "user-settings",
  COPILOT_LAYOUT_USER_SETTING_NAME,
] as const;

// Dev-only trace for `copilot.layout` user-settings reads/writes so it's
// obvious which writes are programmatic (e.g. route transitions) vs user.
function logCopilotLayout(message: string, payload: Record<string, unknown>) {
  if (process.env.ENV !== "development") {
    return;
  }
  console.log(`[copilot-layout] ${message}`, payload);
}

export const copilotLayoutQueryOptions = queryOptions({
  queryKey: copilotLayoutQueryKey,
  queryFn: async ({ signal }): Promise<CopilotLayoutSnapshotV1 | null> => {
    const res = await getUserSetting(COPILOT_LAYOUT_USER_SETTING_NAME, signal);
    if (!res || "error" in res) {
      logCopilotLayout("loaded snapshot", { snapshot: null });
      return null;
    }
    if (
      res.type === "json" &&
      res.value != null &&
      typeof res.value === "object"
    ) {
      const snapshot = parseCopilotLayoutSnapshot(res.value);
      logCopilotLayout("loaded snapshot", { snapshot });
      return snapshot;
    }
    logCopilotLayout("loaded snapshot", { snapshot: null });
    return null;
  },
});

export interface UseCopilotLayoutPersistenceOptions {
  enabled: boolean;
}

export function useCopilotLayoutPersistence(
  options: UseCopilotLayoutPersistenceOptions
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...copilotLayoutQueryOptions,
    enabled: options.enabled,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergeLayout = useCallback(
    (patch: Partial<CopilotLayoutSnapshotV1>) => {
      if (!options.enabled) {
        return;
      }
      let nextSnapshot: CopilotLayoutSnapshotV1 | null = null;
      queryClient.setQueryData(
        copilotLayoutQueryKey,
        (prev: CopilotLayoutSnapshotV1 | null | undefined) => {
          const base =
            prev && typeof prev === "object" && prev.v === 1
              ? prev
              : createEmptyCopilotLayoutSnapshot();
          nextSnapshot = mergeCopilotLayoutSnapshot(base, patch);
          return nextSnapshot;
        }
      );
      logCopilotLayout("mergeLayout (cache)", { nextSnapshot, patch });
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const latest = queryClient.getQueryData<CopilotLayoutSnapshotV1 | null>(
          copilotLayoutQueryKey
        );
        const body = latest ?? createEmptyCopilotLayoutSnapshot();
        logCopilotLayout("persist (server write)", { body });
        void setUserSetting(COPILOT_LAYOUT_USER_SETTING_NAME, {
          type: "json",
          value_jsonb: body,
        });
      }, 300);
    },
    [options.enabled, queryClient]
  );

  const layoutHydrated = !options.enabled || query.isFetched;
  const snapshot = query.data ?? null;

  return useMemo(
    () => ({
      snapshot,
      layoutHydrated,
      mergeLayout,
    }),
    [snapshot, layoutHydrated, mergeLayout]
  );
}
