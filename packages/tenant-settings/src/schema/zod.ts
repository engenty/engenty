import { z } from "zod";

const tenantSettingTypeSchema = z.enum([
  "string",
  "numeric",
  "boolean",
  "json",
]);

export const tenantSettingGetResponseSchema = z.object({
  name: z.string(),
  type: tenantSettingTypeSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.unknown()),
    z.null(),
  ]),
});

const valueMatchesType = (data: {
  type: z.infer<typeof tenantSettingTypeSchema>;
  value_string?: string | null;
  value_jsonb?: unknown;
  value_numeric?: number | null;
  value_boolean?: boolean | null;
}) => {
  switch (data.type) {
    case "string":
      return data.value_string !== undefined;
    case "numeric":
      return data.value_numeric !== undefined;
    case "boolean":
      return data.value_boolean !== undefined;
    case "json":
      return data.value_jsonb !== undefined;
    default:
      return false;
  }
};

const valueMatchesTypeMessage = {
  message:
    "Value must match type (value_string for string, value_numeric for numeric, etc.)",
} as const;

const tenantSettingValueShape = {
  type: tenantSettingTypeSchema,
  value_string: z.string().nullable().optional(),
  value_jsonb: z.unknown().optional(),
  value_numeric: z.number().nullable().optional(),
  value_boolean: z.boolean().nullable().optional(),
};

export const tenantSettingSetRequestSchema = z
  .object(tenantSettingValueShape)
  .refine(valueMatchesType, valueMatchesTypeMessage);

/** Response for the collection endpoint: all (or prefix-filtered) settings. */
export const tenantSettingsListResponseSchema = z.object({
  settings: z.array(tenantSettingGetResponseSchema),
});

/** Optional prefix filter for the collection GET, e.g. ?prefix=appearance. */
export const tenantSettingsListQuerySchema = z.object({
  prefix: z.string().optional(),
});

/** One item in a batch upsert: a named setting plus its typed value. */
export const tenantSettingBatchItemSchema = z
  .object({ name: z.string().min(1), ...tenantSettingValueShape })
  .refine(valueMatchesType, valueMatchesTypeMessage);

/** Batch upsert: one request, many settings. */
export const tenantSettingsBatchSetRequestSchema = z.object({
  settings: z.array(tenantSettingBatchItemSchema).min(1),
});

export type TenantSettingGetResponse = z.infer<
  typeof tenantSettingGetResponseSchema
>;
export type TenantSettingSetRequest = z.infer<
  typeof tenantSettingSetRequestSchema
>;
export type TenantSettingsBatchSetRequest = z.infer<
  typeof tenantSettingsBatchSetRequestSchema
>;
