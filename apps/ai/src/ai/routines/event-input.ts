// How a module event reaches a routine's Action.
//
// Two small decisions, both ported verbatim from the trigger lane because
// their semantics are already load-bearing for existing routines:
//
//  · which events a routine cares about (`event_filter`), and
//  · which fields of the event the Action receives (`input_mapping`).
//
// The mapping grammar is the same one the Action canvas uses for its mapping
// nodes, with the event payload as `initData`. Omitted means the payload
// itself is the input.

/**
 * Shallow filter match: every filter key must equal the payload's top-level
 * value. Objects compare by JSON so a filter can pin a nested shape without
 * this becoming a query language.
 */
export function eventFilterMatches(
  filter: Record<string, unknown> | null,
  payload: Record<string, unknown>
): boolean {
  if (!filter) {
    return true;
  }
  return Object.entries(filter).every(([key, expected]) => {
    const actual = payload[key];
    if (
      expected !== null &&
      typeof expected === "object" &&
      actual !== null &&
      typeof actual === "object"
    ) {
      try {
        return JSON.stringify(actual) === JSON.stringify(expected);
      } catch {
        return false;
      }
    }
    return actual === expected;
  });
}

/** Walk a dotted path into the payload; a missing hop yields undefined. */
function readPath(payload: Record<string, unknown>, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed) {
    return payload;
  }
  let cursor: unknown = payload;
  for (const segment of trimmed.split(".")) {
    if (cursor === null || typeof cursor !== "object") {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** `{template}` interpolates `{{path}}` holes from the payload. */
function renderTemplate(
  template: string,
  payload: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = readPath(payload, path);
    return value === undefined || value === null ? "" : String(value);
  });
}

/**
 * Turn an event payload into the Action's input.
 *
 * With no mapping the payload IS the input — the common case, and the one a
 * routine gets by default.
 */
export function mapEventInput(
  mapping: Record<string, unknown> | null,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!mapping) {
    return payload;
  }
  const input: Record<string, unknown> = {};
  for (const [key, source] of Object.entries(mapping)) {
    if (!source || typeof source !== "object") {
      continue;
    }
    const spec = source as Record<string, unknown>;
    if ("value" in spec) {
      input[key] = spec.value;
      continue;
    }
    if (spec.initData === true && typeof spec.path === "string") {
      input[key] = readPath(payload, spec.path);
      continue;
    }
    if (typeof spec.template === "string") {
      input[key] = renderTemplate(spec.template, payload);
    }
  }
  return input;
}
