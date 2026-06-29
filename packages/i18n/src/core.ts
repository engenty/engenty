import i18n, { type InitOptions } from "i18next";
import { createLazyBackend } from "./backend.js";
import { createEngentyI18nApi } from "./engine.js";
import type { EngentyI18nApi } from "./types.js";

export type { EngentyI18nApi } from "./types.js";

export type CoreNamespaceLoaders = Record<
  string,
  Record<string, () => Promise<Record<string, unknown>>>
>;

export interface CreateCoreI18nOptions {
  coreNamespaces?: CoreNamespaceLoaders;
  defaultLng?: string;
  fallbackLng?: string;
}

let sharedApi: EngentyI18nApi | null = null;

/**
 * Initialize i18n for the core (Node) runtime.
 * Call once at server startup.
 */
export async function initCoreI18n(
  options: CreateCoreI18nOptions = {}
): Promise<EngentyI18nApi> {
  const {
    coreNamespaces = {},
    fallbackLng = "en",
    defaultLng = "en",
  } = options;
  const registry = new Map();
  const backend = createLazyBackend();

  const instance = i18n.createInstance();
  await instance.use(backend as Parameters<typeof instance.use>[0]).init({
    lng: defaultLng,
    fallbackLng,
    interpolation: { escapeValue: false },
    backend: { registry },
    ns: [],
    defaultNS: false,
  } satisfies InitOptions);

  sharedApi = createEngentyI18nApi(instance, coreNamespaces, registry);

  return sharedApi;
}

/**
 * Returns the EngentyI18nApi after initCoreI18n has been called.
 */
export function getCoreI18nApi(): EngentyI18nApi | null {
  return sharedApi;
}
