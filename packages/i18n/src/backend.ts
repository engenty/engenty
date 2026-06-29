import type { RegisterNamespaceInput } from "./types.js";

export interface BackendOptions {
  registry: Map<string, RegisterNamespaceInput>;
}

export function createLazyBackend() {
  let registry: Map<string, RegisterNamespaceInput> | null = null;
  return {
    type: "backend" as const,
    init(_services: unknown, backendOptions: BackendOptions) {
      registry = backendOptions?.registry ?? null;
    },
    read(
      language: string,
      namespace: string,
      callback: (err: Error | null, data?: Record<string, unknown>) => void
    ) {
      if (!registry) {
        callback(new Error("[i18n] Backend not initialized with registry"));
        return;
      }
      const entry = registry.get(namespace);
      if (!entry) {
        callback(null, {});
        return;
      }
      const loader =
        entry.loadersByLocale[language] ??
        entry.loadersByLocale.en ??
        entry.loadersByLocale.en;
      if (!loader) {
        callback(null, {});
        return;
      }
      loader()
        .then((data) => {
          callback(null, (data ?? {}) as Record<string, unknown>);
        })
        .catch((err) => {
          callback(err instanceof Error ? err : new Error(String(err)));
        });
    },
  };
}
