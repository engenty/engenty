import type { i18n as I18nInstance } from "i18next";
import type {
  EngentyI18nApi,
  I18nBundleLoader,
  RegisterNamespaceInput,
} from "./types.js";

type CoreNamespaceRegistry = Record<string, Record<string, I18nBundleLoader>>;

/**
 * Loaded bundle cache: namespace -> Set(locale)
 */
const loadedCache = new WeakMap<I18nInstance, Map<string, Set<string>>>();

function getLoadedCache(i18n: I18nInstance): Map<string, Set<string>> {
  let cache = loadedCache.get(i18n);
  if (!cache) {
    cache = new Map();
    loadedCache.set(i18n, cache);
  }
  return cache;
}

function isLoaded(
  i18n: I18nInstance,
  namespace: string,
  locale: string
): boolean {
  return getLoadedCache(i18n).get(namespace)?.has(locale) ?? false;
}

function markLoaded(
  i18n: I18nInstance,
  namespace: string,
  locale: string
): void {
  let set = getLoadedCache(i18n).get(namespace);
  if (!set) {
    set = new Set();
    getLoadedCache(i18n).set(namespace, set);
  }
  set.add(locale);
}

async function ensureNamespaceLoaded(
  i18n: I18nInstance,
  namespace: string,
  locale: string,
  loadersByLocale: Record<string, I18nBundleLoader>
): Promise<void> {
  if (isLoaded(i18n, namespace, locale)) {
    return;
  }
  const loader =
    loadersByLocale[locale] ?? loadersByLocale.en ?? loadersByLocale.en;
  if (!loader) {
    return;
  }
  const resources = await loader();
  if (resources && typeof resources === "object") {
    i18n.addResourceBundle(locale, namespace, resources, true, true);
    markLoaded(i18n, namespace, locale);
  }
}

/**
 * Creates the plugin-facing EngentyI18nApi backed by an i18next instance.
 * Pass an external registry when using the lazy backend so it shares the same Map.
 */
export function createEngentyI18nApi(
  i18n: I18nInstance,
  coreNamespaces: CoreNamespaceRegistry,
  externalRegistry?: Map<string, RegisterNamespaceInput>
): EngentyI18nApi {
  const registry =
    externalRegistry ?? new Map<string, RegisterNamespaceInput>();

  return {
    registerNamespace(input: RegisterNamespaceInput) {
      const { namespace } = input;
      if (registry.has(namespace)) {
        return;
      }
      registry.set(namespace, input);
    },

    async preloadCoreNamespaces(locale: string) {
      for (const [ns, loaders] of Object.entries(coreNamespaces)) {
        await ensureNamespaceLoaded(i18n, ns, locale, loaders);
      }
    },

    t(key: string, options?: Record<string, unknown>): string {
      return i18n.t(key, options ?? {}) as string;
    },
  };
}

/**
 * Ensures a plugin namespace is loaded for the current (or given) locale.
 * Called when a component uses useTranslation(namespace) or when t is used with a namespaced key.
 */
export async function loadPluginNamespace(
  i18n: I18nInstance,
  registry: Map<string, RegisterNamespaceInput>,
  namespace: string,
  locale?: string
): Promise<void> {
  const entry = registry.get(namespace);
  if (!entry) {
    return;
  }
  const lng = locale ?? i18n.language;
  await ensureNamespaceLoaded(i18n, namespace, lng, entry.loadersByLocale);
  const fallbackLng = i18n.options.fallbackLng;
  const fallback = Array.isArray(fallbackLng) ? fallbackLng[0] : fallbackLng;
  if (typeof fallback === "string" && fallback !== lng) {
    await ensureNamespaceLoaded(
      i18n,
      namespace,
      fallback,
      entry.loadersByLocale
    );
  }
}
