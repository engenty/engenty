interface JsonPatchLikeOperation {
  op: string;
  path: string;
  value?: unknown;
}

export interface ParsedDashboardTemplate {
  elements: Record<string, unknown>;
  root: string;
  state?: Record<string, unknown>;
}

function cleanJson(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function decodeJsonPointerPart(part: string) {
  return part.replaceAll("~1", "/").replaceAll("~0", "~");
}

function setByJsonPointer(
  target: Record<string, unknown>,
  path: string,
  value: unknown
) {
  const parts = path
    .split("/")
    .slice(1)
    .map((part) => decodeJsonPointerPart(part));
  if (parts.length === 0) {
    return;
  }

  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const current = cursor[part];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts.at(-1) as string] = value;
}

function parseJsonPatchOperations(
  text: string
): Record<string, unknown> | null {
  const lines = cleanJson(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const operations: JsonPatchLikeOperation[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as JsonPatchLikeOperation;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.op !== "string" ||
        typeof parsed.path !== "string"
      ) {
        return null;
      }
      operations.push(parsed);
    } catch {
      return null;
    }
  }

  if (
    operations.length === 0 ||
    !operations.every((operation) => ["add", "replace"].includes(operation.op))
  ) {
    return null;
  }

  const doc: Record<string, unknown> = {};
  for (const operation of operations) {
    setByJsonPointer(doc, operation.path, operation.value);
  }
  return doc;
}

function extractJsonObject(text: string): string {
  const cleaned = cleanJson(text);
  const start = cleaned.indexOf("{");
  if (start < 0) {
    return cleaned;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;
  let quote = "";
  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (inString) {
      if (char === "\\") {
        isEscaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return cleaned;
}

function asParsedDashboardTemplate(
  value: unknown
): ParsedDashboardTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.root !== "string" ||
    !record.elements ||
    typeof record.elements !== "object" ||
    Array.isArray(record.elements)
  ) {
    return null;
  }

  return {
    root: record.root,
    elements: record.elements as Record<string, unknown>,
    ...(record.state &&
    typeof record.state === "object" &&
    !Array.isArray(record.state)
      ? { state: record.state as Record<string, unknown> }
      : {}),
  };
}

export function parseDashboardTemplateString(
  template: string
): ParsedDashboardTemplate | null {
  const patchDoc = parseJsonPatchOperations(template);
  const raw = patchDoc ?? (JSON.parse(extractJsonObject(template)) as unknown);
  const object =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  return (
    asParsedDashboardTemplate(object.template) ??
    asParsedDashboardTemplate(
      object.config &&
        typeof object.config === "object" &&
        (object.config as Record<string, unknown>).template
    ) ??
    asParsedDashboardTemplate(object)
  );
}
