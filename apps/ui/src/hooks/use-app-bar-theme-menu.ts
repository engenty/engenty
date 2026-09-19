import type { AppBarThemeMenu } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  applyCustomColors,
  applySidebarColor,
  COLOR_SETS_PRESETS,
} from "@/lib/appearance-constants";
import {
  appearanceSettingsOptions,
  useSaveAppearanceSettingsMutation,
} from "@/lib/appearance-settings-queries";
import { DEFAULT_APPEARANCE } from "@/lib/dal/appearance-settings";

/**
 * "Theme ›" on the app-bar context menu: the colour-tone presets from
 * Settings → Appearance, applied at once and saved to the tenant appearance
 * settings — the same thing the Appearance overview's preset chips do.
 */
export function useAppBarThemeMenu({
  enabled,
}: {
  enabled: boolean;
}): AppBarThemeMenu | undefined {
  const { t } = useTranslation("common");
  const query = useQuery({ ...appearanceSettingsOptions, enabled });
  const saveMutation = useSaveAppearanceSettingsMutation();
  const settings = query.data ?? DEFAULT_APPEARANCE;

  return useMemo(() => {
    if (!enabled) {
      return;
    }
    const current =
      COLOR_SETS_PRESETS.find(
        (preset) =>
          preset.light.primary === settings.colorPrimary &&
          preset.light.secondary === settings.colorSecondary &&
          preset.light.background === settings.colorBackground &&
          preset.light.sidebar === settings.sidebarColor
      )?.id ?? null;
    return {
      current,
      onSelect: (id) => {
        const preset = COLOR_SETS_PRESETS.find((p) => p.id === id);
        if (!preset || id === current) {
          return;
        }
        const next = {
          ...settings,
          colorPrimary: preset.light.primary,
          colorSecondary: preset.light.secondary,
          colorBackground: preset.light.background,
          sidebarColor: preset.light.sidebar,
        };
        applyCustomColors(
          next.colorPrimary,
          next.colorSecondary,
          next.colorBackground,
          next.contrast
        );
        applySidebarColor(next.sidebarColor);
        saveMutation.mutate(
          { current: next, lastSaved: settings },
          {
            onError: () => {
              toast.error(t("settings.appearance.saveFailed"));
            },
          }
        );
      },
      options: COLOR_SETS_PRESETS.map((preset) => ({
        id: preset.id,
        label: t(preset.nameKey),
        swatches: [
          preset.light.primary,
          preset.light.secondary,
          preset.light.background,
          preset.light.sidebar,
        ],
      })),
    };
  }, [enabled, saveMutation, settings, t]);
}
