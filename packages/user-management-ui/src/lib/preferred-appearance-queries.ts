import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  deleteUserSetting,
  getUserSettings,
  setUserSettings,
} from "./user-settings-api.js";

const APPEARANCE_PREFIX = "appearance.";

const APPEARANCE_KEYS = {
  language: "appearance.language",
  themeMode: "appearance.theme_mode",
  fontSize: "appearance.font_size",
  contrast: "appearance.contrast",
  colorBlind: "appearance.colorblind",
} as const;

function parseString(
  value: string | number | boolean | Record<string, unknown> | null | undefined,
  fallback: string
): string {
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

export interface PreferredAppearanceData {
  colorBlind: string | null;
  contrast: string | null;
  fontSize: string | null;
  language: string | null;
  themeMode: string | null;
}

export const preferredAppearanceKeys = {
  all: ["user-settings", "preferred-appearance"] as const,
};

export const preferredAppearanceOptions = queryOptions({
  queryKey: preferredAppearanceKeys.all,
  queryFn: async ({ signal }): Promise<PreferredAppearanceData> => {
    // Single request for the whole `appearance.*` namespace.
    const { settings } = await getUserSettings(APPEARANCE_PREFIX, signal);
    const byName = new Map(settings.map((s) => [s.name, s.value]));
    const get = (key: string): string | null => {
      const value = byName.get(key);
      return value == null ? null : parseString(value, "") || null;
    };
    return {
      language: get(APPEARANCE_KEYS.language),
      themeMode: get(APPEARANCE_KEYS.themeMode),
      fontSize: get(APPEARANCE_KEYS.fontSize),
      contrast: get(APPEARANCE_KEYS.contrast),
      colorBlind: get(APPEARANCE_KEYS.colorBlind),
    };
  },
});

export function usePreferredAppearanceQuery() {
  return useQuery(preferredAppearanceOptions);
}

export function useSavePreferredAppearanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      language: string;
      themeMode: string;
      fontSize: string;
      contrast: string;
      colorBlind: string;
    }) => {
      await setUserSettings([
        {
          name: APPEARANCE_KEYS.language,
          type: "string",
          value_string: payload.language,
        },
        {
          name: APPEARANCE_KEYS.themeMode,
          type: "string",
          value_string: payload.themeMode,
        },
        {
          name: APPEARANCE_KEYS.fontSize,
          type: "string",
          value_string: payload.fontSize,
        },
        {
          name: APPEARANCE_KEYS.contrast,
          type: "string",
          value_string: payload.contrast,
        },
        {
          name: APPEARANCE_KEYS.colorBlind,
          type: "string",
          value_string: payload.colorBlind,
        },
      ]);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: preferredAppearanceKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: ["workspace-context"],
        }),
      ]);
    },
  });
}

export function useResetPreferredAppearanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await Promise.all([
        deleteUserSetting(APPEARANCE_KEYS.language),
        deleteUserSetting(APPEARANCE_KEYS.themeMode),
        deleteUserSetting(APPEARANCE_KEYS.fontSize),
        deleteUserSetting(APPEARANCE_KEYS.contrast),
        deleteUserSetting(APPEARANCE_KEYS.colorBlind),
      ]);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: preferredAppearanceKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: ["workspace-context"],
        }),
      ]);
    },
  });
}
