/**
 * Async loader for a translation bundle.
 * Returns nested key-value object (e.g. { "invoice": { "create": "Create Invoice" } }).
 */
export type I18nBundleLoader = () => Promise<Record<string, unknown>>;

export interface RegisterNamespaceInput {
  loadersByLocale: Record<string, I18nBundleLoader>;
  namespace: string;
  pluginId: string;
}

/**
 * Plugin-facing i18n API passed via EngentyPluginContext.
 */
export interface EngentyI18nApi {
  preloadCoreNamespaces: (locale: string) => Promise<void>;
  registerNamespace: (input: RegisterNamespaceInput) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}
