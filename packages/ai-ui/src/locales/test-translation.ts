// Tests only: `useTranslation` over this package's own locale files, so a test
// reads labels as a person sees them and can switch to German.
import de from "./de.json";
import en from "./en.json";

let current: "de" | "en" = "en";

export function setTestLocale(locale: "de" | "en"): void {
  current = locale;
}

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      current === "de" ? de : en
    );
}

function t(key: string, options: Record<string, unknown> = {}): string {
  const plural =
    typeof options.count === "number"
      ? lookup(`${key}_${options.count === 1 ? "one" : "other"}`)
      : undefined;
  const text = plural ?? lookup(key);
  return typeof text === "string"
    ? text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name]))
    : key;
}

export function useTranslation() {
  return { t };
}
