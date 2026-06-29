export type {
  DashboardAgenticCache,
  DashboardAgenticDefinition,
  DashboardDocument,
  DashboardJsonUiConfig,
  DashboardLayout,
  DashboardQueryDefinition,
  DashboardRuntimeContext,
  DashboardSection,
  DashboardTemplate,
  DashboardWidgetInstance,
  JsonUiDashboardWidget,
  RegisteredDashboardWidget,
} from "./schema.js";
export {
  DASHBOARD_SCHEMA_VERSION,
  dashboardAgenticCacheSchema,
  dashboardAgenticDefinitionSchema,
  dashboardDocumentSchema,
  dashboardJsonUiConfigSchema,
  dashboardLayoutSchema,
  dashboardQueryDefinitionSchema,
  dashboardRuntimeContextSchema,
  dashboardSectionSchema,
  dashboardWidgetInstanceSchema,
  jsonUiDashboardWidgetSchema,
  registeredDashboardWidgetSchema,
  resolveDashboardRuntimeContextInclude,
} from "./schema.js";
export type { ParsedDashboardTemplate } from "./template.js";
export { parseDashboardTemplateString } from "./template.js";
