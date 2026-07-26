import { vi } from "vitest";
import en from "./src/locales/en/common.json";

// The suite runs in an English world. Alongside the i18n mock below, the
// `test` script pins LC_ALL=en_US.UTF-8 — Intl reads the machine locale at
// process start, so it cannot be set from here, and without it assertions on
// `toLocaleString` output (money, dates) fail on non-en-US machines.

function resolveKey(key: string, params?: Record<string, unknown>): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (obj, part) =>
        obj && typeof obj === "object"
          ? (obj as Record<string, unknown>)[part]
          : undefined,
      en
    );
  let text = typeof value === "string" ? value : key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      text = text.replace(new RegExp(`{{${name}}}`, "g"), String(replacement));
    }
  }
  return text;
}

// Global i18n mock: resolves keys against the real en locale with simple
// {{var}} interpolation, so tests assert on human-readable text.
vi.mock("@engenty/i18n/ui", () => ({
  useTranslation: () => ({
    t: resolveKey,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

// Pages set breadcrumbs via usePageConfig, which needs the PageHeaderProvider
// that the real AppLayout supplies. Tests render pages standalone, so no-op it.
vi.mock("@engenty/ui-plugin-sdk", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  usePageConfig: () => undefined,
}));
