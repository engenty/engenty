/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** App release version, injected at build time from the root package.json. */
  readonly VITE_APP_VERSION: string;
  /**
   * PRO builds that ship `apps/manage` set this. Auto-handoff from Setup is
   * deferred; Open builds leave it unset.
   */
  readonly VITE_MANAGE_APP_ENABLED?: string;
  /**
   * Sampled UI interaction telemetry (INP, named interactions, long tasks,
   * route transitions, startup bytes, API latency). Off unless `"1"` / `"true"`.
   */
  readonly VITE_UI_PERFORMANCE_TELEMETRY?: string;
  /** Optional POST URL for sampled interaction telemetry. Empty = collect only. */
  readonly VITE_UI_PERFORMANCE_TELEMETRY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
