import { useTranslation } from "@engenty/i18n/ui";
import {
  AUTH_LOCALES,
  AUTH_TRANSLATIONS,
  type AuthLocale,
  setAuthLocalePreference,
} from "../lib/auth-i18n";

/**
 * Compact language switch for the first-run wizard. The active locale shows
 * its full name; the other option stays a two-letter code.
 */
export function AuthLocaleSwitch({
  label,
  locale,
  onChange,
}: {
  label: string;
  locale: AuthLocale;
  onChange: (locale: AuthLocale) => void;
}) {
  const { i18n } = useTranslation();

  const select = (next: AuthLocale) => {
    setAuthLocalePreference(next);
    if (i18n.isInitialized) {
      void i18n.changeLanguage(next);
    }
    onChange(next);
  };

  return (
    <div
      aria-label={label}
      className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted/40 p-0.5"
      role="radiogroup"
    >
      {AUTH_LOCALES.map((code) => {
        const selected = code === locale;
        return (
          <button
            aria-checked={selected}
            className={`h-7 whitespace-nowrap rounded-full px-2.5 font-medium text-xs transition-colors ${
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            key={code}
            lang={code}
            onClick={() => select(code)}
            role="radio"
            type="button"
          >
            {selected
              ? AUTH_TRANSLATIONS[code].languageName
              : code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
