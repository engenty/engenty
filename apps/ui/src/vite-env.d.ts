/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** App release version, injected at build time from the root package.json. */
  readonly VITE_APP_VERSION: string;
  /**
   * PRO builds that ship `apps/manage` set this so Setup → Plugins hands off
   * to `/manage/modules`. Open builds leave it unset.
   */
  readonly VITE_MANAGE_APP_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
