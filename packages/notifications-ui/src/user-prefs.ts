// Per-user notification settings on core.user_settings:
//   notifications.<class>.<channel> = on | off | digest
//   notifications.quiet_hours       = "HH:MM-HH:MM"
//   notifications.quiet_hours_tz    = IANA zone
//   notifications.views             = saved filter sets (json)
import { requestApiJson } from "@engenty/api-client";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import type { ListNotificationsInput } from "./api.js";
import type { NotificationLaneFilter } from "./classification.js";

const PREFIX = "notifications";

interface SettingRow {
  name: string;
  type: "string" | "numeric" | "boolean" | "json";
  value: unknown;
}

export const prefsKeys = {
  all: ["user-settings", PREFIX] as const,
};

export function useNotificationSettingsQuery() {
  return useQuery({
    queryKey: prefsKeys.all,
    queryFn: async ({ signal }) => {
      const result = await requestApiJson<{ settings: SettingRow[] }>(
        `/api/user-settings?prefix=${PREFIX}`,
        { signal }
      );
      const map = new Map<string, unknown>();
      for (const row of result.settings ?? []) {
        map.set(row.name, row.value);
      }
      return map;
    },
    staleTime: 30_000,
  });
}

export function useSetNotificationSettingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      value: string | Record<string, unknown> | unknown[] | null;
    }) =>
      input.value === null
        ? requestApiJson<unknown>(
            `/api/user-settings/${encodeURIComponent(input.name)}`,
            { method: "DELETE" }
          )
        : requestApiJson<unknown>(
            `/api/user-settings/${encodeURIComponent(input.name)}`,
            {
              body:
                typeof input.value === "string"
                  ? { type: "string", value_string: input.value }
                  : { type: "json", value_jsonb: input.value },
              method: "PATCH",
            }
          ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: prefsKeys.all });
    },
  });
}

export interface SavedView {
  filter: Pick<
    ListNotificationsInput,
    "actor" | "class" | "kind" | "source" | "stream"
  > & { lane?: NotificationLaneFilter; search?: string };
  name: string;
}

export const VIEWS_SETTING = `${PREFIX}.views`;

export function readSavedViews(
  settings: Map<string, unknown> | undefined
): SavedView[] {
  const raw = settings?.get(VIEWS_SETTING);
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { views?: unknown }).views)
      ? ((raw as { views: unknown[] }).views ?? [])
      : [];
  return list.filter(
    (entry): entry is SavedView =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as SavedView).name === "string" &&
      typeof (entry as SavedView).filter === "object"
  );
}
