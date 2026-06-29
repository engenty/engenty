import i18n, { type InitOptions } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { createLazyBackend } from "./backend.js";
import { createEngentyI18nApi } from "./engine.js";
import type { EngentyI18nApi } from "./types.js";

export { useTranslation } from "react-i18next";
export type { EngentyI18nApi } from "./types.js";

export type CoreNamespaceLoaders = Record<
  string,
  Record<string, () => Promise<Record<string, unknown>>>
>;

export interface CreateUiI18nOptions {
  coreNamespaces?: CoreNamespaceLoaders;
  fallbackLng?: string;
}

let sharedApi: EngentyI18nApi | null = null;

/**
 * Initialize i18n for the UI (browser) runtime.
 * Call once at app bootstrap, before rendering.
 */
export async function initUiI18n(
  options: CreateUiI18nOptions = {}
): Promise<EngentyI18nApi> {
  const { coreNamespaces = {}, fallbackLng = "en" } = options;
  const registry = new Map();
  const backend = createLazyBackend();

  await i18n
    .use(backend as Parameters<typeof i18n.use>[0])
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
      },
      backend: { registry },
      ns: [],
      defaultNS: false,
    } satisfies InitOptions);

  sharedApi = createEngentyI18nApi(
    i18n as Parameters<typeof createEngentyI18nApi>[0],
    coreNamespaces,
    registry
  );
  (sharedApi as unknown as { _registry: typeof registry })._registry = registry;

  return sharedApi;
}

/**
 * Returns the EngentyI18nApi after initUiI18n has been called.
 * Plugins use the API from EngentyPluginContext; this is for app bootstrap wiring.
 */
export function getEngentyI18nApi(): EngentyI18nApi | null {
  return sharedApi;
}

/**
 * Wires the registry from the shared API into plugin registration.
 * The registry is shared so registerNamespace populates the backend's registry.
 */
export function getEngentyI18nApiWithRegistry(): {
  api: EngentyI18nApi;
  registry: Map<string, import("./types.js").RegisterNamespaceInput>;
} | null {
  if (!sharedApi) {
    return null;
  }
  const extended = sharedApi as unknown as {
    _registry?: Map<string, import("./types.js").RegisterNamespaceInput>;
  };
  const registry = extended._registry;
  if (!registry) {
    return null;
  }
  return { api: sharedApi, registry };
}
