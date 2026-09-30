// Per-user notification settings on core.user_settings:
//   notifications.<class>.<channel> = on | off | digest
//   notifications.quiet_hours       = "HH:MM-HH:MM"
//   notifications.quiet_hours_tz    = IANA zone
import { requestApiJson } from "@engenty/api-client";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";

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
