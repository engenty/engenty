/**
 * Runtime overrides for build-time `import.meta.env` values.
 *
 * The desktop shell (Tauri) bundles the web SPA but must point it at a
 * user-chosen server, so `VITE_*` values baked at build time cannot be
 * trusted there. Before the app renders, the desktop bootstrap writes the
 * server-provided values onto `globalThis.__ENGENTY_RUNTIME_ENV__`; readers
 * consult this override first and fall back to `import.meta.env`.
 *
 * On the web this global is never set, so behavior is unchanged.
 */

export const ENGENTY_RUNTIME_ENV_GLOBAL = "__ENGENTY_RUNTIME_ENV__";

interface RuntimeEnvHost {
  __ENGENTY_RUNTIME_ENV__?: Record<string, string | undefined>;
}

/** Returns the runtime override for `key`, or `undefined` when not set. */
export function runtimeEnvOverride(key: string): string | undefined {
  const host = globalThis as RuntimeEnvHost;
  const value = host.__ENGENTY_RUNTIME_ENV__?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Installs (merges) runtime env overrides. Call before the app renders. */
export function setRuntimeEnvOverrides(
  values: Record<string, string | undefined>
): void {
  const host = globalThis as RuntimeEnvHost;
  host.__ENGENTY_RUNTIME_ENV__ = {
    ...host.__ENGENTY_RUNTIME_ENV__,
    ...values,
  };
}
