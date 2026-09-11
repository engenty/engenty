import deJson from "./locales/de/www.json";
import enJson from "./locales/en/www.json";

export const WWW_LOCALES = ["en", "de"] as const;
export type WwwLocale = (typeof WWW_LOCALES)[number];

export const WWW_LOCALE_PREFS = ["auto", "en", "de"] as const;
export type WwwLocalePref = (typeof WWW_LOCALE_PREFS)[number];

export const WWW_LOCALE_STORAGE_KEY = "engenty-www-locale";

const HREFLANG_ALTERNATES: readonly { hreflang: string; path: string }[] = [
  { hreflang: "en", path: "/en" },
  { hreflang: "de", path: "/de" },
  { hreflang: "x-default", path: "/" },
];

type Widen<T> = T extends string
  ? string
  : T extends number | boolean | null
    ? T
    : T extends readonly (infer U)[]
      ? Widen<U>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T;

export type WwwCopy = Widen<typeof enJson>;

const copies: Record<WwwLocale, WwwCopy> = {
  de: deJson,
  en: enJson,
};

export function isWwwLocale(
  value: string | null | undefined
): value is WwwLocale {
  return value === "en" || value === "de";
}

export function isWwwLocalePref(
  value: string | null | undefined
): value is WwwLocalePref {
  return value === "auto" || isWwwLocale(value);
}

export function getWwwCopy(locale: WwwLocale): WwwCopy {
  return copies[locale];
}

/** `/en`, `/en/`, `/de/foo` → locale. `/` and unknown paths → `null` (Auto). */
export function parseWwwLocalePath(pathname: string): WwwLocale | null {
  const normalized = normalizePathname(pathname);
  const match = /^\/(en|de)(?:\/.*)?$/.exec(normalized);
  return match && isWwwLocale(match[1]) ? match[1] : null;
}

export function wwwLocaleHref(
  locale: WwwLocale,
  search = "",
  hash = ""
): string {
  return `/${locale}${search}${hash}`;
}

export function wwwAutoHref(search = "", hash = ""): string {
  return `/${search}${hash}`;
}

export function detectBrowserWwwLocale(
  languages: readonly string[] = defaultNavigatorLanguages()
): WwwLocale {
  for (const language of languages) {
    const lower = language.toLowerCase();
    if (lower.startsWith("de")) {
      return "de";
    }
    if (lower.startsWith("en")) {
      return "en";
    }
  }
  return "en";
}

/** `/` Auto entry: stored en/de override, otherwise browser languages. */
export function resolveRootRedirectLocale(
  stored: string | null,
  languages: readonly string[]
): WwwLocale {
  if (isWwwLocale(stored)) {
    return stored;
  }
  return detectBrowserWwwLocale(languages);
}

export function detectWwwLocale(
  language = typeof navigator === "undefined" ? "en" : navigator.language,
  stored?: string | null
): WwwLocale {
  const saved = stored === undefined ? readStoredLocalePref() : stored;
  if (isWwwLocale(saved)) {
    return saved;
  }
  return detectBrowserWwwLocale([language]);
}

export function persistWwwLocalePref(pref: WwwLocalePref): void {
  try {
    localStorage.setItem(WWW_LOCALE_STORAGE_KEY, pref);
  } catch {
    // Private mode / blocked storage — language still works for this session.
  }
}

export function readStoredLocalePref(): WwwLocalePref | null {
  try {
    const stored = localStorage.getItem(WWW_LOCALE_STORAGE_KEY);
    return isWwwLocalePref(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function applyDocumentLocale(locale: WwwLocale): void {
  const copy = copies[locale];
  document.documentElement.lang = locale;
  document.title = copy.meta.title;
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute("content", copy.meta.description);
  syncHreflangAlternates();
}

function syncHreflangAlternates(): void {
  const origin = window.location.origin;
  for (const { hreflang, path } of HREFLANG_ALTERNATES) {
    let link = document.querySelector(
      `link[rel="alternate"][hreflang="${hreflang}"]`
    );
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("hreflang", hreflang);
      document.head.appendChild(link);
    }
    link.setAttribute("href", `${origin}${path}`);
  }
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

export function navigatorWwwLanguages(): string[] {
  return defaultNavigatorLanguages();
}

function defaultNavigatorLanguages(): string[] {
  if (typeof navigator === "undefined") {
    return ["en"];
  }
  if (navigator.languages.length > 0) {
    return [...navigator.languages];
  }
  return [navigator.language];
}
