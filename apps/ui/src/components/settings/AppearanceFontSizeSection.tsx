import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { Check } from "lucide-react";
import { FONT_SIZE_OPTIONS } from "@/lib/appearance-constants";
import { cn } from "@/lib/utils";

interface AppearanceFontSizeSectionProps {
  onChange: (id: string) => void;
  value: string;
}

export function AppearanceFontSizeSection({
  value,
  onChange,
}: AppearanceFontSizeSectionProps) {
  const { t } = useTranslation("common");

  return (
    <SettingsFormSection
      description={t("settings.fontSizeDescription")}
      title={t("settings.fontSize")}
    >
      <div className="flex gap-2 pt-2 sm:pt-0">
        {FONT_SIZE_OPTIONS.map((size) => {
          const isActive = value === size.id;
          return (
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              )}
              key={size.id}
              onClick={() => onChange(size.id)}
              type="button"
            >
              {size.label}
              {isActive && <Check className="ml-1 h-3.5 w-3.5 text-primary" />}
            </button>
          );
        })}
      </div>
    </SettingsFormSection>
  );
}
