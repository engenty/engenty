import { isWwwLocalePref, WWW_LOCALE_PREFS } from "../i18n";
import { useWwwI18n } from "../i18n-provider";

export function LocaleChooser() {
  const { copy, pref, setPref } = useWwwI18n();

  return (
    <div className="flex items-center gap-2">
      <label
        className="font-mono text-white/55 text-xs uppercase tracking-[0.08em]"
        htmlFor="www-locale-chooser"
      >
        {copy.nav.language}
      </label>
      <select
        aria-label={copy.nav.language}
        className="h-8 min-w-[7.5rem] bg-white/10 font-mono text-white text-xs hover:bg-white/15"
        id="www-locale-chooser"
        onChange={(event) => {
          const next = event.target.value;
          if (isWwwLocalePref(next)) {
            setPref(next);
          }
        }}
        value={pref}
      >
        {WWW_LOCALE_PREFS.map((code) => (
          <option className="text-ink" key={code} value={code}>
            {copy.languageChooser[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
