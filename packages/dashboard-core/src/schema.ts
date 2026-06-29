import { z } from "zod";

export const DASHBOARD_SCHEMA_VERSION = 1;
const runtimeContextIncludeValues = [
  "datetime",
  "dashboard",
  "route",
  "tenant",
  "ui",
  "user",
] as const;

export const dashboardLayoutSchema = z.strictObject({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
  minW: z.number().int().min(1).max(12).optional(),
  minH: z.number().int().min(1).max(12).optional(),
});

export const dashboardQueryDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  path: z.string().min(1),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  contextKey: z.string().min(1),
  refreshPolicy: z.enum(["always", "manual"]).default("always"),
});

const dashboardStructuredOutputSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("string") }),
    z.strictObject({ type: z.literal("number") }),
    z.strictObject({ type: z.literal("boolean") }),
    z.strictObject({ type: z.literal("null") }),
    z.strictObject({
      type: z.literal("array"),
      items: dashboardStructuredOutputSchema,
    }),
    z.strictObject({
      type: z.literal("object"),
      properties: z.record(z.string(), dashboardStructuredOutputSchema),
      required: z.array(z.string()).optional(),
    }),
  ])
);

export const dashboardRuntimeContextSchema = z.strictObject({
  include: z.array(z.enum(runtimeContextIncludeValues)).default([]),
});

export const dashboardAgenticDefinitionSchema = z
  .strictObject({
    agentId: z.string().min(1),
    instructions: z.string().min(1).max(8000),
    /** Context keys to pass into the agent (e.g. query results). May be empty if only instructions/outputSchema are needed. */
    inputContextKeys: z.array(z.string().min(1)).min(0),
    outputSchema: dashboardStructuredOutputSchema,
    cachePolicy: z.strictObject({
      mode: z.enum(["manual", "ttl"]),
      ttlSeconds: z.number().int().positive().optional(),
    }),
  })
  .superRefine((value, ctx) => {
    if (
      value.cachePolicy.mode === "ttl" &&
      value.cachePolicy.ttlSeconds == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ttlSeconds is required when cachePolicy.mode is ttl",
        path: ["cachePolicy", "ttlSeconds"],
      });
    }
  });

export const dashboardAgenticCacheSchema = z.strictObject({
  status: z.enum(["empty", "ready", "error"]).default("empty"),
  generatedAt: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
  payload: z.unknown().optional(),
  error: z.string().optional(),
});

export const dashboardJsonUiConfigSchema = z.strictObject({
  template: z.string().min(1),
  queries: z.array(dashboardQueryDefinitionSchema).default([]),
  agentic: dashboardAgenticDefinitionSchema.optional(),
  summary: z.string().max(240).optional(),
  runtimeContext: dashboardRuntimeContextSchema.optional(),
  cache: dashboardAgenticCacheSchema.optional(),
});

const dashboardWidgetBaseSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().max(120).optional(),
  layout: dashboardLayoutSchema,
  configVersion: z.number().int().min(1).default(1),
  source: z.enum(["ai-generated", "starter", "user"]).default("user"),
});

export const registeredDashboardWidgetSchema = dashboardWidgetBaseSchema.extend(
  {
    kind: z.literal("registered"),
    widgetType: z.string().min(1),
    config: z.unknown().default({}),
  }
);

export const jsonUiDashboardWidgetSchema = dashboardWidgetBaseSchema.extend({
  kind: z.literal("json_ui"),
  widgetType: z.literal("json_ui"),
  config: dashboardJsonUiConfigSchema,
  generatedFromPrompt: z.string().max(1000).optional(),
  /** Model id used at generation time (for debugging in settings). */
  generatedWithModelId: z.string().max(120).optional(),
});

export const dashboardWidgetInstanceSchema = z.discriminatedUnion("kind", [
  registeredDashboardWidgetSchema,
  jsonUiDashboardWidgetSchema,
]);

export const dashboardSectionSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  widgets: z.array(dashboardWidgetInstanceSchema).default([]),
});

export const dashboardDocumentSchema = z.strictObject({
  id: z.string().min(1),
  schemaVersion: z
    .literal(DASHBOARD_SCHEMA_VERSION)
    .default(DASHBOARD_SCHEMA_VERSION),
  owner_user_id: z.string().min(1).optional(),
  title: z.string().max(120).optional(),
  sections: z.array(dashboardSectionSchema).min(1).default([]),
  updated_at: z.string().optional(),
});

export type DashboardDocument = z.infer<typeof dashboardDocumentSchema>;
export type DashboardAgenticDefinition = z.infer<
  typeof dashboardAgenticDefinitionSchema
>;
export type DashboardAgenticCache = z.infer<typeof dashboardAgenticCacheSchema>;
export type DashboardJsonUiConfig = z.infer<typeof dashboardJsonUiConfigSchema>;
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;
export type DashboardQueryDefinition = z.infer<
  typeof dashboardQueryDefinitionSchema
>;
export type DashboardRuntimeContext = z.infer<
  typeof dashboardRuntimeContextSchema
>;
export type DashboardSection = z.infer<typeof dashboardSectionSchema>;
export type DashboardTemplate = string;
export type DashboardWidgetInstance = z.infer<
  typeof dashboardWidgetInstanceSchema
>;
export type JsonUiDashboardWidget = z.infer<typeof jsonUiDashboardWidgetSchema>;
export type RegisteredDashboardWidget = z.infer<
  typeof registeredDashboardWidgetSchema
>;

export function resolveDashboardRuntimeContextInclude(
  runtimeContext?: DashboardRuntimeContext | null
) {
  return runtimeContext?.include ?? [];
}
