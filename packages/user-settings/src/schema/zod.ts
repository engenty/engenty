import { z } from "zod";

const userSettingTypeSchema = z.enum(["string", "numeric", "boolean", "json"]);

export const userSettingGetResponseSchema = z.object({
  name: z.string(),
  type: userSettingTypeSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.unknown()),
    z.null(),
  ]),
});

const valueMatchesType = (data: {
  type: z.infer<typeof userSettingTypeSchema>;
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

const userSettingValueShape = {
  type: userSettingTypeSchema,
  value_string: z.string().nullable().optional(),
  value_jsonb: z.unknown().optional(),
  value_numeric: z.number().nullable().optional(),
  value_boolean: z.boolean().nullable().optional(),
};

export const userSettingSetRequestSchema = z
  .object(userSettingValueShape)
  .refine(valueMatchesType, valueMatchesTypeMessage);

/** Response for the collection endpoint: all (or prefix-filtered) settings. */
export const userSettingsListResponseSchema = z.object({
  settings: z.array(userSettingGetResponseSchema),
});

/** Optional prefix filter for the collection GET, e.g. ?prefix=appearance. */
export const userSettingsListQuerySchema = z.object({
  prefix: z.string().optional(),
});

/** One item in a batch upsert: a named setting plus its typed value. */
export const userSettingBatchItemSchema = z
  .object({ name: z.string().min(1), ...userSettingValueShape })
  .refine(valueMatchesType, valueMatchesTypeMessage);

/** Batch upsert: one request, many settings. */
export const userSettingsBatchSetRequestSchema = z.object({
  settings: z.array(userSettingBatchItemSchema).min(1),
});

export type UserSettingGetResponse = z.infer<
  typeof userSettingGetResponseSchema
>;
export type UserSettingSetRequest = z.infer<typeof userSettingSetRequestSchema>;
export type UserSettingsBatchSetRequest = z.infer<
  typeof userSettingsBatchSetRequestSchema
>;
