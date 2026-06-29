import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { FONT_OPTIONS } from "@/lib/appearance-constants";
import { cn } from "@/lib/utils";

interface AppearanceFontSectionProps {
  onChange: (id: string) => void;
  value: string;
}

export function AppearanceFontSection({
  value,
  onChange,
}: AppearanceFontSectionProps) {
  const { t } = useTranslation("common");

  useEffect(() => {
    for (const f of FONT_OPTIONS) {
      if (f.googleFontName) {
        const linkId = `google-font-preview-${f.id}`;
        if (!document.getElementById(linkId)) {
          const link = document.createElement("link");
          link.id = linkId;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${f.googleFontName}:wght@400;500;600;700&display=swap`;
          document.head.appendChild(link);
        }
      }
    }
  }, []);

  return (
    <SettingsFormSection
      description={t("settings.fontDescription")}
      title={t("settings.font")}
    >
      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 sm:pt-0">
        {FONT_OPTIONS.map((f) => {
          const isActive = value === f.id;
          return (
            <button
              className={cn(
                "relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
                isActive
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-accent"
              )}
              key={f.id}
              onClick={() => onChange(f.id)}
              type="button"
            >
              <div className="flex w-full items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{f.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">
                    {f.category}
                  </span>
                </div>
                {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>
              <div
                className="w-full rounded-md border bg-background p-3"
                style={{ fontFamily: f.family }}
              >
                <p className="text-lg leading-snug">
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </SettingsFormSection>
  );
}
