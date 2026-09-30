/**
 * Working memory — how things are now, per key, as the fixed fields of its
 * scope (`WORKING_MEMORY_FIELDS`). Two writers besides people:
 *
 * - `working_memory_set` — the agent sets or clears one field in any scope
 *   this conversation may write (not the company, which needs an approval).
 * - the observer — observational memory's own call returns the fields that
 *   changed, as one more extracted value; only for the keys whose readers are
 *   this conversation's readers (`unaskedWriteKeys`). No extra model call.
 */
import {
  type MemoryScope,
  normalizeWorkingMemoryPatch,
  WORKING_MEMORY_FIELDS,
  WORKING_MEMORY_VALUE_MAX_CHARS,
  type WorkingMemoryPatch,
  workingMemoryFieldKeys,
  workingMemoryLines,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { createTool } from "@mastra/core/tools";
import { Extractor } from "@mastra/memory/processors";
import { z } from "zod";
import type { WorkingMemoryStore } from "../../dal/memory/index.js";
import type { MemoryKeys } from "./memory-scopes.js";

const logger = createLogger({ name: "apps/ai/working-memory" });

export const WORKING_MEMORY_SET_TOOL_ID = "working_memory_set";

type LocalScope = Exclude<MemoryScope, "company">;
const LOCAL_SCOPES: readonly LocalScope[] = ["user", "agent", "space"];

function fieldGuide(scope: MemoryScope): string {
  return WORKING_MEMORY_FIELDS[scope]
    .map((field) => `${field.key} (${field.hint})`)
    .join(", ");
}

/** What the agent is told about working memory, after the memory rules. */
export const WORKING_MEMORY_INSTRUCTIONS = `## Working memory

The "Now:" lines in Memory are working memory: how things are right now, a few fixed fields per scope. A new value replaces the old one.
- Something that changes and has one current value — their language, role, time zone, what they or the team are focused on now — goes in working memory with \`${WORKING_MEMORY_SET_TOOL_ID}\`. A fact worth keeping with its date goes in a note (\`memory_note\`).
- Clear a field with value null when it no longer holds. It is also kept up to date from the conversation on its own; set it yourself when someone tells you directly.`;

export function createWorkingMemoryTool(input: {
  keys: MemoryKeys;
  store: WorkingMemoryStore;
  tenantId: string;
  /** Who said it; null for an unattended run. */
  userId: string | null;
}) {
  const scopes = LOCAL_SCOPES.filter((scope) => input.keys[scope]);
  const [first, ...rest] = scopes;
  if (!first) {
    return null;
  }
  const tool = createTool({
    id: WORKING_MEMORY_SET_TOOL_ID,
    description:
      "Set or clear one working-memory field — the current value of something that changes. Replaces the old value.",
    inputSchema: z.object({
      field: z
        .string()
        .describe(
          `The field, by scope: ${scopes.map((scope) => `${scope}: ${fieldGuide(scope)}`).join("; ")}.`
        ),
      scope: z.enum([first, ...rest]),
      value: z
        .string()
        .max(WORKING_MEMORY_VALUE_MAX_CHARS)
        .nullable()
        .describe("The new value, one line; null clears the field."),
    }),
    outputSchema: z.object({
      reason: z.string().optional(),
      set: z.boolean(),
    }),
    execute: async ({ field, scope, value }) => {
      const key = input.keys[scope];
      if (!key) {
        return {
          reason: `The ${scope} scope is not open in this conversation.`,
          set: false,
        };
      }
      const patch = normalizeWorkingMemoryPatch(scope, { [field]: value });
      if (Object.keys(patch).length === 0) {
        return {
          reason: `${scope} has no field "${field}"; its fields are ${workingMemoryFieldKeys(scope).join(", ")}.`,
          set: false,
        };
      }
      await input.store.patch({
        key,
        patch,
        tenantId: input.tenantId,
        updatedByUserId: input.userId,
      });
      return { set: true };
    },
  });
  return { [WORKING_MEMORY_SET_TOOL_ID]: tool };
}

export type WorkingMemoryTools = NonNullable<
  ReturnType<typeof createWorkingMemoryTool>
>;

/** The observer's output for this extractor: changed fields per scope. */
function parseObserverPatches(
  raw: unknown,
  scopes: readonly MemoryScope[]
): Partial<Record<MemoryScope, WorkingMemoryPatch>> {
  let value = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text || text === "null") {
      return {};
    }
    try {
      value = JSON.parse(text);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Partial<Record<MemoryScope, WorkingMemoryPatch>> = {};
  for (const scope of scopes) {
    const fields = (value as Record<string, unknown>)[scope];
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      const patch = normalizeWorkingMemoryPatch(
        scope,
        fields as Record<string, unknown>
      );
      if (Object.keys(patch).length > 0) {
        out[scope] = patch;
      }
    }
  }
  return out;
}

/**
 * The observer's working-memory extractor for one run, or null when the
 * conversation may write no key. `keys` are already the unasked-write keys.
 */
export function createWorkingMemoryExtractor(input: {
  keys: MemoryKeys;
  store: WorkingMemoryStore;
  tenantId: string;
  userId: string | null;
}): Extractor | null {
  const scopes = LOCAL_SCOPES.filter((scope) => input.keys[scope]);
  if (scopes.length === 0) {
    return null;
  }
  return new Extractor({
    // Inline: the observer returns it in its own output, no second call.
    includePreviousExtraction: false,
    instructions: async () => {
      const current = await Promise.all(
        scopes.map(async (scope) => {
          const key = input.keys[scope];
          const row = key
            ? await input.store.get({ key, tenantId: input.tenantId })
            : null;
          const lines = workingMemoryLines(scope, row?.state ?? {});
          return [
            `${scope} — fields: ${fieldGuide(scope)}`,
            lines.length > 0
              ? `current:\n${lines.join("\n")}`
              : "current: (empty)",
          ].join("\n");
        })
      );
      return [
        'Working memory: the current value of things that change. Return a JSON object with only the fields the conversation shows have changed, by scope — for example {"user": {"current_focus": "…"}}. A value replaces the old one; null clears a field that no longer holds. Only what was said or clearly shown, never guesses. Return null when nothing changed.',
        ...current,
      ].join("\n\n");
    },
    metadataKeyPath: false,
    name: "Working memory state",
    onExtracted: async ({ current }) => {
      const patches = parseObserverPatches(current, scopes);
      for (const [scope, patch] of Object.entries(patches) as [
        MemoryScope,
        WorkingMemoryPatch,
      ][]) {
        const key = input.keys[scope];
        if (!key) {
          continue;
        }
        try {
          await input.store.patch({
            key,
            patch,
            tenantId: input.tenantId,
            updatedByUserId: input.userId,
          });
        } catch (error) {
          logger.warn("working memory update from observer failed", {
            err: error,
            scope,
          });
        }
      }
    },
  });
}
