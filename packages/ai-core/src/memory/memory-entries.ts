/**
 * Memory entries — the shared contract of `ai.memory_entries`: the scopes, the
 * line an entry renders as, and each scope's size limit. apps/ai renders and
 * writes three scopes; apps/core writes the company scope behind an approval;
 * the UI lists them. All three measure and show a line the same way from here.
 */

export type MemoryScope = "agent" | "user" | "space" | "company";

/** Render order: widest audience first, the agent's own notes last. */
export const MEMORY_SCOPES: readonly MemoryScope[] = [
  "company",
  "space",
  "user",
  "agent",
];

/** Characters a section may hold, lines included. The cap is what makes an agent forget. */
export const MEMORY_SECTION_MAX_CHARS: Record<MemoryScope, number> = {
  agent: 8000,
  company: 4000,
  space: 4000,
  user: 2000,
};

export const MEMORY_BODY_MAX_CHARS = 400;

/** Who may decide an agent's write to the company scope, and write it directly. */
export { COMPANY_MEMORY_MANAGE_CAPABILITY } from "@engenty/plugin-sdk";
export const COMPANY_MEMORY_ADD_OPERATION_ID = "company_memory_add";
export const COMPANY_MEMORY_REMOVE_OPERATION_ID = "company_memory_remove";

export const MEMORY_SHORT_ID_LENGTH = 6;

/** The id an entry is named by in the block: the last six hex digits of its uuid. */
export function shortMemoryId(id: string): string {
  return id.replace(/-/g, "").slice(-MEMORY_SHORT_ID_LENGTH).toLowerCase();
}

export interface MemoryLineInput {
  body: string;
  created_at: string;
  id: string;
}

export function memoryLine(row: MemoryLineInput): string {
  return `- [${shortMemoryId(row.id)}] ${row.created_at.slice(0, 10)}: ${row.body}`;
}

/** A section's size once rendered — what the cap is measured against. */
export function memorySectionLength(rows: readonly MemoryLineInput[]): number {
  return rows.map(memoryLine).join("\n").length;
}

/** One entry's text as stored: a single line, trimmed. */
export function normalizeMemoryBody(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Whether one more entry still fits its section. The candidate is measured
 * with a placeholder id and today's date — the same width a real one gets.
 */
export function memorySectionFits(input: {
  body: string;
  rows: readonly MemoryLineInput[];
  scope: MemoryScope;
}): { fits: boolean; length: number; limit: number } {
  const length = memorySectionLength([
    ...input.rows,
    {
      body: input.body,
      created_at: new Date().toISOString(),
      id: "0".repeat(32),
    },
  ]);
  const limit = MEMORY_SECTION_MAX_CHARS[input.scope];
  return { fits: length <= limit, length, limit };
}
