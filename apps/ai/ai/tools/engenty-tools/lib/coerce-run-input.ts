import { runInputSchema } from "../schema/schemas.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asInputObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(value) ? value : {};
}

const ENVELOPE_KEYS = new Set(["id", "input", "input_json"]);

function omitRunEnvelope(
  record: Record<string, unknown>
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (ENVELOPE_KEYS.has(key)) {
      continue;
    }
    rest[key] = value;
  }
  return rest;
}

/**
 * Models often flatten `engenty_tool_execute` arguments beside `id`, stringify
 * the nested object, or put JSON in `input_json`. Recover those shapes before
 * the empty-input guard fires. Nested `input: {}` objects are a transport miss
 * — they are not treated as a successful empty payload when siblings exist.
 */
export function coerceRunInput(raw: unknown): {
  id: string;
  input: Record<string, unknown>;
} {
  const record = isRecord(raw) ? raw : {};
  const nested = asInputObject(record.input);
  const fromAlias =
    Object.keys(nested).length > 0 ? {} : asInputObject(record.input_json);
  const recovered =
    Object.keys(nested).length > 0
      ? nested
      : Object.keys(fromAlias).length > 0
        ? fromAlias
        : omitRunEnvelope(record);
  const parsed = runInputSchema.parse({
    id: record.id,
    ...(Object.keys(recovered).length > 0 ? { input: recovered } : {}),
  });
  return { id: parsed.id, input: recovered };
}
