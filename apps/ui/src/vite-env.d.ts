/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** App release version, injected at build time from the root package.json. */
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
