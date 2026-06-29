import type { ZodType } from "zod";
import { z } from "zod";

export {
  ENGENTY_SERVICE_ERROR_CODES,
  type EngentyServiceErrorCode,
} from "./service-error-codes.js";

export type ApiErrorFields = Record<string, string[]>;

export interface ApiErrorShape {
  code: string;
  details?: unknown;
  fields?: ApiErrorFields;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorShape;
  ok: false;
}

export interface ApiSuccessResponse<T, M = undefined> {
  data: T;
  meta?: M;
  ok: true;
}

export type ApiResponse<T, M = undefined> =
  | ApiErrorResponse
  | ApiSuccessResponse<T, M>;

export const apiErrorFieldsSchema = z.record(z.string(), z.array(z.string()));

export const apiErrorShapeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  fields: apiErrorFieldsSchema.optional(),
});

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: apiErrorShapeSchema,
});

export const apiPaginatedMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export function apiSuccessSchema<
  TDataSchema extends ZodType,
  TMetaSchema extends ZodType | undefined = undefined,
>(dataSchema: TDataSchema, metaSchema?: TMetaSchema) {
  const shape = {
    ok: z.literal(true),
    data: dataSchema,
    ...(metaSchema ? { meta: metaSchema.optional() } : {}),
  };

  return z.object(shape) as unknown as z.ZodType<
    ApiSuccessResponse<
      z.infer<TDataSchema>,
      TMetaSchema extends ZodType ? z.infer<TMetaSchema> : undefined
    >
  >;
}

export function apiPaginatedSuccessSchema<TItemSchema extends ZodType>(
  itemSchema: TItemSchema
) {
  return apiSuccessSchema(z.array(itemSchema), apiPaginatedMetaSchema);
}

export function apiResponseSchema<
  TDataSchema extends ZodType,
  TMetaSchema extends ZodType | undefined = undefined,
>(dataSchema: TDataSchema, metaSchema?: TMetaSchema) {
  return z.union([
    apiSuccessSchema(dataSchema, metaSchema),
    apiErrorResponseSchema,
  ]) as unknown as z.ZodType<
    ApiResponse<
      z.infer<TDataSchema>,
      TMetaSchema extends ZodType ? z.infer<TMetaSchema> : undefined
    >
  >;
}

export function isApiSuccess<T, M = undefined>(
  value: unknown
): value is ApiSuccessResponse<T, M> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    (value as { ok?: unknown }).ok === true &&
    "data" in value
  );
}

export function isApiError(value: unknown): value is ApiErrorResponse {
  return apiErrorResponseSchema.safeParse(value).success;
}

export function parseApiSuccess<
  TDataSchema extends ZodType,
  TMetaSchema extends ZodType | undefined = undefined,
>(value: unknown, dataSchema: TDataSchema, metaSchema?: TMetaSchema) {
  return apiSuccessSchema(dataSchema, metaSchema).parse(value);
}

export function parseApiResponse<
  TDataSchema extends ZodType,
  TMetaSchema extends ZodType | undefined = undefined,
>(value: unknown, dataSchema: TDataSchema, metaSchema?: TMetaSchema) {
  return apiResponseSchema(dataSchema, metaSchema).parse(value);
}

export function getApiErrorMessage(
  value: unknown,
  fallback = "Unexpected API error"
) {
  const parsed = apiErrorResponseSchema.safeParse(value);
  return parsed.success ? parsed.data.error.message : fallback;
}

export function getApiErrorCode(value: unknown, fallback = "unknown_error") {
  const parsed = apiErrorResponseSchema.safeParse(value);
  return parsed.success ? parsed.data.error.code : fallback;
}

export function unwrapApiSuccess<
  TDataSchema extends ZodType,
  TMetaSchema extends ZodType | undefined = undefined,
>(value: unknown, dataSchema: TDataSchema, metaSchema?: TMetaSchema) {
  const parsed = parseApiSuccess(value, dataSchema, metaSchema);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export function createApiError(input: ApiErrorShape): ApiErrorResponse {
  return {
    ok: false,
    error: input,
  };
}

export function createApiSuccess<T, M = undefined>(
  data: T,
  meta?: M
): ApiSuccessResponse<T, M> {
  return {
    ok: true,
    data,
    ...(meta === undefined ? {} : { meta }),
  };
}

export function isPaginatedPayload(
  value: unknown
): value is { data: unknown; total: number; page: number; pageSize: number } {
  if (!(typeof value === "object" && value !== null)) {
    return false;
  }

  const candidate = value as {
    data?: unknown;
    total?: unknown;
    page?: unknown;
    pageSize?: unknown;
  };

  return (
    "data" in candidate &&
    typeof candidate.total === "number" &&
    typeof candidate.page === "number" &&
    typeof candidate.pageSize === "number"
  );
}

export function normalizeSuccessPayload(value: unknown) {
  if (isPaginatedPayload(value)) {
    return createApiSuccess(value.data, {
      total: value.total,
      page: value.page,
      pageSize: value.pageSize,
    });
  }

  if (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    "data" in value
  ) {
    return createApiSuccess((value as { data: unknown }).data);
  }

  return createApiSuccess(value);
}

export function isJsonContentType(contentType: string | null | undefined) {
  return Boolean(contentType?.toLowerCase().includes("json"));
}

/** ZodError-like shape (Zod 4 ZodError does not extend Error; duck-type for compatibility). */
interface ZodErrorLike {
  flatten: () => {
    formErrors: string[];
    fieldErrors: Record<string, string[]>;
  };
  issues: unknown[];
  message: string;
}

export function isZodError(e: unknown): e is ZodErrorLike {
  return (
    !!e &&
    typeof e === "object" &&
    "issues" in e &&
    Array.isArray((e as { issues: unknown }).issues) &&
    "flatten" in e &&
    typeof (e as { flatten: unknown }).flatten === "function"
  );
}

/**
 * Format a ZodError (or ZodError-like) into ApiErrorShape for API responses.
 * Use when catching validation errors so clients receive structured field errors.
 */
export function formatZodErrorForApiError(e: ZodErrorLike): ApiErrorShape {
  const flat = e.flatten();
  return {
    code: "validation_error",
    message: e.message,
    ...(Object.keys(flat.fieldErrors).length > 0
      ? { fields: flat.fieldErrors }
      : {}),
  };
}
