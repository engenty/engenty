import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { Check } from "lucide-react";
import { LANGUAGES } from "@/lib/appearance-constants";
import { cn } from "@/lib/utils";

interface AppearanceLanguageSectionProps {
  currentLang: string;
  onChange: (code: string) => void;
  value: string;
}

export function AppearanceLanguageSection({
  value,
  currentLang,
  onChange,
}: AppearanceLanguageSectionProps) {
  const { t } = useTranslation("common");

  return (
    <SettingsFormSection
      description={t("settings.languageDescription")}
      title={t("settings.language")}
    >
      <div className="flex gap-2">
        {LANGUAGES.map((lang) => (
          <button
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors",
              value === lang.code || currentLang === lang.code
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            )}
            key={lang.code}
            onClick={() => onChange(lang.code)}
            type="button"
          >
            <span className="text-base">{lang.flag}</span>
            {lang.label}
            {(value === lang.code || currentLang === lang.code) && (
              <Check className="ml-1 h-3.5 w-3.5 text-primary" />
            )}
          </button>
        ))}
      </div>
    </SettingsFormSection>
  );
}
