export type PluginCreateUiLoadMode = "runtime" | "workspace";

export interface PluginCreateAnswers {
  description: string;
  displayName: string;
  includeUi: boolean;
  /** When true, scaffold src/api with OpenAPI-typed route (+ UI client when includeUi). */
  serverRoutes: boolean;
  slug: string;
  uiLoad: PluginCreateUiLoadMode;
}
