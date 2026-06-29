export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonPatchOperation =
  | { from: string; op: "copy" | "move"; path: string }
  | { op: "add" | "replace" | "test"; path: string; value: JsonValue }
  | { op: "remove"; path: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return Number.isFinite(value as number) || typeof value !== "number";
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return (
    isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry))
  );
}
