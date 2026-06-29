import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { THEME_MODES } from "@/lib/appearance-constants";
import { cn } from "@/lib/utils";

interface AppearanceModeSectionProps {
  onChange: (id: string) => void;
  resolvedTheme: string;
  value: string;
}

export function AppearanceModeSection({
  value,
  resolvedTheme,
  onChange,
}: AppearanceModeSectionProps) {
  const { t } = useTranslation("common");

  return (
    <SettingsFormSection
      description={t("settings.modeDescription")}
      title={t("settings.mode")}
    >
      <div className="grid grid-cols-3 gap-3 pt-2 sm:pt-0">
        {THEME_MODES.map((mode) => {
          const Icon =
            mode.id === "dark" ? Moon : mode.id === "light" ? Sun : Laptop;
          const isActive = value === mode.id || resolvedTheme === mode.id;
          return (
            <button
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-lg border p-4 transition-colors",
                isActive
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-accent"
              )}
              key={mode.id}
              onClick={() => onChange(mode.id)}
              type="button"
            >
              <div
                className={cn(
                  "flex h-16 w-full items-end gap-1 rounded-md border p-2",
                  mode.id === "dark"
                    ? "border-zinc-700 bg-zinc-900"
                    : mode.id === "light"
                      ? "border-zinc-200 bg-white"
                      : "border-zinc-400 bg-linear-to-r from-white to-zinc-900"
                )}
              >
                <div
                  className={cn(
                    "h-2 w-6 rounded-sm",
                    mode.id === "dark" ? "bg-zinc-600" : "bg-zinc-300"
                  )}
                />
                <div
                  className={cn(
                    "h-3 w-4 rounded-sm",
                    mode.id === "dark" ? "bg-zinc-500" : "bg-zinc-200"
                  )}
                />
                <div
                  className={cn(
                    "h-4 w-5 rounded-sm",
                    mode.id === "dark" ? "bg-zinc-600" : "bg-zinc-300"
                  )}
                />
              </div>
              <div className="flex items-center gap-1.5 font-medium text-sm">
                <Icon className="h-3.5 w-3.5" />
                {t(mode.labelKey)}
              </div>
              {isActive && (
                <div className="absolute top-2 right-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </SettingsFormSection>
  );
}
