// Form state for one outcome binding — used by the destinations dialog, so
// payload shaping and required-field checks live next to the trigger helpers
// rather than inside the dialog.
import type {
  OutcomeProviderDto,
  RoutineOutcomeDto,
  RoutineOutcomeInput,
  RoutineOutcomeMode,
} from "./routines-api.js";

export interface OutcomeFormValue {
  config: Record<string, unknown>;
  description: string;
  enabled: boolean;
  mode: RoutineOutcomeMode;
  providerId: string;
}

export type OutcomeFormErrorKey =
  | "providerRequired"
  | "configRequired"
  | "configInvalid";

export interface JsonSchemaProperty {
  default?: unknown;
  description?: string;
  enum?: unknown[];
  format?: string;
  maxLength?: number;
  minLength?: number;
  title?: string;
  type?: string | string[];
  [key: string]: unknown;
}

export interface JsonSchemaObject {
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  type?: string;
}

export function schemaObject(
  schema: Record<string, unknown> | undefined
): JsonSchemaObject {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { properties: {}, required: [] };
  }
  const properties =
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, JsonSchemaProperty>)
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  return { properties, required };
}

export function defaultOutcomeFormValue(providerId = ""): OutcomeFormValue {
  return {
    config: {},
    description: "",
    enabled: true,
    mode: "always",
    providerId,
  };
}

export function defaultConfigFromSchema(
  schema: Record<string, unknown> | undefined
): Record<string, unknown> {
  const { properties } = schemaObject(schema);
  const config: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties ?? {})) {
    if (prop.default !== undefined) {
      config[key] = prop.default;
    }
  }
  return config;
}

export function outcomeToFormValue(row: RoutineOutcomeDto): OutcomeFormValue {
  return {
    config: row.config ?? {},
    description: row.description ?? "",
    enabled: row.enabled,
    mode: row.mode,
    providerId: row.provider_id,
  };
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

/** Drop empty strings so optional schema fields are omitted, not sent as "". */
export function compactOutcomeConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (isBlank(value)) {
      continue;
    }
    next[key] = typeof value === "string" ? value.trim() : value;
  }
  return next;
}

export function outcomeFormToInput(
  value: OutcomeFormValue
): RoutineOutcomeInput {
  return {
    config: compactOutcomeConfig(value.config),
    description: value.description.trim() || null,
    enabled: value.enabled,
    mode: value.mode,
    provider_id: value.providerId,
  };
}

export function validateOutcomeForm(
  value: OutcomeFormValue,
  provider?: OutcomeProviderDto | null
): OutcomeFormErrorKey | null {
  if (!value.providerId.trim()) {
    return "providerRequired";
  }
  if (!provider) {
    return "providerRequired";
  }
  const { properties, required } = schemaObject(provider.config_schema);
  for (const key of required ?? []) {
    if (isBlank(value.config[key])) {
      return "configRequired";
    }
  }
  for (const [key, prop] of Object.entries(properties ?? {})) {
    const raw = value.config[key];
    if (isBlank(raw) || typeof raw !== "string") {
      continue;
    }
    if (
      typeof prop.minLength === "number" &&
      raw.trim().length < prop.minLength
    ) {
      return "configInvalid";
    }
  }
  return null;
}
