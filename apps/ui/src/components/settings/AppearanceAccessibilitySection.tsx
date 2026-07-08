import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppearanceAccessibilitySectionProps {
  colorBlind: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  contrast: "normal" | "high";
  onChangeColorBlind: (
    val: "none" | "protanopia" | "deuteranopia" | "tritanopia"
  ) => void;
  onChangeContrast: (val: "normal" | "high") => void;
}

export function AppearanceAccessibilitySection({
  contrast,
  onChangeContrast,
  colorBlind,
  onChangeColorBlind,
}: AppearanceAccessibilitySectionProps) {
  const { t } = useTranslation("common");

  const CONTRAST_OPTIONS = [
    { id: "normal" as const, label: t("settings.contrast.normal") },
    { id: "high" as const, label: t("settings.contrast.high") },
  ];

  const COLORBLIND_OPTIONS = [
    { id: "none" as const, label: t("common.none") },
    {
      id: "deuteranopia" as const,
      label: t("settings.colorBlind.redGreen"),
    },
    { id: "tritanopia" as const, label: t("settings.colorBlind.blueYellow") },
  ];

  return (
    <SettingsFormSection
      description={t("settings.accessibilityDescription")}
      title={t("settings.accessibility")}
    >
      <div className="space-y-6 pt-2 sm:pt-0">
        {/* Contrast options */}
        <div className="space-y-2">
          <div className="font-medium text-foreground text-sm">
            {t("settings.contrastTitle")}
          </div>
          <div className="flex gap-2">
            {CONTRAST_OPTIONS.map((opt) => {
              const isActive = contrast === opt.id;
              return (
                <button
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  )}
                  key={opt.id}
                  onClick={() => onChangeContrast(opt.id)}
                  type="button"
                >
                  {opt.label}
                  {isActive && (
                    <Check className="ml-1 h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color blindness options */}
        <div className="space-y-2">
          <div className="font-medium text-foreground text-sm">
            {t("settings.colorBlindTitle")}
          </div>
          <div className="flex flex-wrap gap-2">
            {COLORBLIND_OPTIONS.map((opt) => {
              const isActive = colorBlind === opt.id;
              return (
                <button
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  )}
                  key={opt.id}
                  onClick={() => onChangeColorBlind(opt.id)}
                  type="button"
                >
                  {opt.label}
                  {isActive && (
                    <Check className="ml-1 h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SettingsFormSection>
  );
}
