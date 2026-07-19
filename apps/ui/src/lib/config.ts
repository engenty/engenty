import { getUiEnv } from "./env";

/**
 * Resolved lazily on every access: the desktop shell installs runtime env
 * overrides in `bootstrap()` AFTER the module graph has evaluated, so a
 * module-scope snapshot here would freeze the empty build-time values and
 * send API calls to the tauri://localhost origin (whose SPA fallback answers
 * every path with index.html — "successful" requests full of HTML).
 */
export const config = {
  get apiBaseUrl(): string {
    return getUiEnv().apiBaseUrl;
  },
  get aiBaseUrl(): string {
    return getUiEnv().aiBaseUrl;
  },
};
