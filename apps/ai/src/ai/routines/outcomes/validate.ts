import { jsonSchemaToZod } from "@mastra/core/workflows";
import { RoutineValidationError } from "../routine-validation.js";

/** Validate standing config or a run payload against a provider JSON schema. */
export function validateAgainstJsonSchema(
  schema: Record<string, unknown>,
  value: unknown,
  label: string
): Record<string, unknown> {
  const data =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  let parsed: { success: true; data: unknown } | { success: false };
  try {
    parsed = jsonSchemaToZod(schema).safeParse(data);
  } catch (err) {
    throw new RoutineValidationError(
      "routines.outcomeSchemaInvalid",
      `${label} schema could not be applied: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!parsed.success) {
    const detail = (
      parsed as { success: false; error?: { issues?: { message: string }[] } }
    ).error?.issues
      ?.map((issue) => issue.message)
      .join("; ");
    throw new RoutineValidationError(
      "routines.outcomePayloadInvalid",
      `${label} did not match its schema${detail ? `: ${detail}` : ""}`
    );
  }
  return (parsed.data ?? {}) as Record<string, unknown>;
}
