import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection, Skeleton } from "@engenty/ui-core";
import { PaletteIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  applyCustomColors,
  applySidebarColor,
  COLOR_SETS_PRESETS,
} from "@/lib/appearance-constants";
import {
  useAppearanceSettingsQuery,
  useSaveAppearanceSettingsMutation,
} from "@/lib/appearance-settings-queries";
import { DEFAULT_APPEARANCE } from "@/lib/dal/appearance-settings";
import { cn } from "@/lib/utils";

export function TenantAppearanceSettingsSection() {
  const { t } = useTranslation("common");
  const query = useAppearanceSettingsQuery();
  const saveMutation = useSaveAppearanceSettingsMutation();

  const settings = query.data ?? DEFAULT_APPEARANCE;
  const isLoading = query.isLoading && !query.data;
  const busy = saveMutation.isPending;

  const applyPreset = (preset: (typeof COLOR_SETS_PRESETS)[number]) => {
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
  };

  return (
    <SettingsFormSection
      cardVariant="flush"
      description={t("settings.appearance.overviewDescription")}
      title={t("settings.appearanceTitle")}
    >
      <div className="space-y-0 divide-y divide-border">
        <div className="px-4 py-4">
          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton className="h-8 w-28 rounded-full" key={i} />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {COLOR_SETS_PRESETS.map((preset) => {
                const isActive =
                  settings.colorPrimary === preset.light.primary &&
                  settings.colorSecondary === preset.light.secondary &&
                  settings.colorBackground === preset.light.background &&
                  settings.sidebarColor === preset.light.sidebar;
                return (
                  <button
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-xs shadow-xs transition-all disabled:opacity-60",
                      isActive
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent"
                    )}
                    disabled={busy}
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    type="button"
                  >
                    <span className="flex shrink-0 items-center -space-x-1">
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: preset.light.primary }}
                      />
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: preset.light.secondary }}
                      />
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: preset.light.background }}
                      />
                    </span>
                    <span>{t(preset.nameKey)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Link
          className="flex items-center justify-center gap-2 px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
          to="/settings/appearance"
        >
          <PaletteIcon className="size-3" />
          {t("settings.appearance.manageAll")}
        </Link>
      </div>
    </SettingsFormSection>
  );
}
