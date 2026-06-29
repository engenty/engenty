import type { EngentyI18nApi } from "./types.js";

/**
 * No-op i18n API for use before init or when i18n is unavailable.
 * registerNamespace is a no-op; t returns the key unchanged.
 */
export function createStubI18nApi(): EngentyI18nApi {
  return {
    registerNamespace: () => {},
    preloadCoreNamespaces: () => Promise.resolve(),
    t: (key: string) => key,
  };
}
