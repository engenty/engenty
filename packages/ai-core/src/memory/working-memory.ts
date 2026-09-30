/**
 * Working memory — the shared contract of `ai.working_memory`: the current
 * state of one person, Space, company or agent, as a few named fields.
 *
 * Memory entries (memory-entries.ts) are dated facts that are added; working
 * memory is "how things are now" and a new value replaces the old one. Each
 * scope has its own fixed fields — the schema is what keeps it small and keeps
 * dated facts out of it.
 */
import type { MemoryScope } from "./memory-entries.js";

export interface WorkingMemoryField {
  /** What the field holds, told to the model that fills it. */
  hint: string;
  key: string;
}

export const WORKING_MEMORY_FIELDS: Record<
  MemoryScope,
  readonly WorkingMemoryField[]
> = {
  agent: [
    {
      hint: "What you are used for here, as the people here describe your job",
      key: "job",
    },
    {
      hint: "How they want your work delivered here: format, length, tone",
      key: "style",
    },
  ],
  company: [
    { hint: "What the company does, in one or two sentences", key: "about" },
    { hint: "The language the company works in", key: "language" },
    { hint: "What the company is focused on right now", key: "priorities" },
  ],
  space: [
    { hint: "What this Space is for", key: "purpose" },
    {
      hint: "What the team here is working on right now",
      key: "current_focus",
    },
    { hint: "The language work here is done in", key: "language" },
  ],
  user: [
    { hint: "The language they want answers in", key: "language" },
    {
      hint: "Their role and what they are responsible for",
      key: "role",
    },
    { hint: "Their time zone, as an IANA name", key: "timezone" },
    { hint: "What they are working on right now", key: "current_focus" },
  ],
};

export const WORKING_MEMORY_VALUE_MAX_CHARS = 300;

/** Field key → value; a field that is not set is absent. */
export type WorkingMemoryState = Record<string, string>;

/** A change: a value sets the field, `null` clears it. */
export type WorkingMemoryPatch = Record<string, string | null>;

export function workingMemoryFieldKeys(scope: MemoryScope): string[] {
  return WORKING_MEMORY_FIELDS[scope].map((field) => field.key);
}

/**
 * The patch as stored: only the scope's own fields, values on one line,
 * trimmed and capped; an empty value clears. Unknown fields are dropped.
 */
export function normalizeWorkingMemoryPatch(
  scope: MemoryScope,
  patch: Record<string, unknown>
): WorkingMemoryPatch {
  const out: WorkingMemoryPatch = {};
  for (const key of workingMemoryFieldKeys(scope)) {
    if (!Object.hasOwn(patch, key)) {
      continue;
    }
    const value = patch[key];
    if (value === null) {
      out[key] = null;
    } else if (typeof value === "string") {
      const text = value
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, WORKING_MEMORY_VALUE_MAX_CHARS);
      out[key] = text || null;
    }
  }
  return out;
}

export function applyWorkingMemoryPatch(
  state: WorkingMemoryState,
  patch: WorkingMemoryPatch
): WorkingMemoryState {
  const next: WorkingMemoryState = { ...state };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** The set fields in schema order, as `- key: value` lines. */
export function workingMemoryLines(
  scope: MemoryScope,
  state: WorkingMemoryState
): string[] {
  return workingMemoryFieldKeys(scope)
    .filter((key) => state[key])
    .map((key) => `- ${key}: ${state[key]}`);
}
