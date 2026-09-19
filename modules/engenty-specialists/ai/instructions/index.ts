// The standing appendix of every specialist — hired into the tenant
// (database) or shipped by a module. Assembled into the prompt with the
// catalog floor, so a mandate or a manifest cannot omit how context, memory,
// records, routines and colleagues work.
//
// Two markdown assets, edited like an AGENTS.md: SPECIALIST.md is the body,
// REPORT.md the section a non-coordinator gets on top. The memory and tasks
// instructions are composed in by the caller (they are apps/ai's, bound to
// its MEMORY.md / TASKS.md mounts) at the `{{MEMORY_AND_TASKS}}` mark.
import reportMarkdown from "./REPORT.md";
import specialistMarkdown from "./SPECIALIST.md";

const MEMORY_AND_TASKS_MARK = "{{MEMORY_AND_TASKS}}";

export interface SpecialistInstructionsInput {
  /** apps/ai `AGENT_MEMORY_INSTRUCTIONS`. */
  memory: string;
  /** apps/ai `AGENT_TASKS_INSTRUCTIONS`. */
  tasks: string;
  /** Reports to nobody in this Space — a coordinator. */
  topLevel: boolean;
}

/** The appendix body with memory and tasks composed in. */
export function renderSpecialistAppendix(input: {
  memory: string;
  tasks: string;
}): string {
  if (!specialistMarkdown.includes(MEMORY_AND_TASKS_MARK)) {
    throw new Error(
      `SPECIALIST.md lost its ${MEMORY_AND_TASKS_MARK} mark — memory and tasks would be dropped from every specialist`
    );
  }
  return specialistMarkdown.replace(
    MEMORY_AND_TASKS_MARK,
    `${input.memory.trim()}\n\n${input.tasks.trim()}`
  );
}

/**
 * For every specialist that is NOT a coordinator of its Space: where the
 * management verbs live. Without it a report asked to hire, add an app or
 * open a Task reads the missing tool as "cannot be done" and says so — the
 * one failure this floor must never produce.
 */
export const SPECIALIST_REPORT_INSTRUCTIONS: string = reportMarkdown.trim();

/**
 * The prompt sections a specialist run carries, in order: the appendix, and
 * for a report the hand-over section. One place decides who gets which.
 */
export function specialistInstructionParts(
  input: SpecialistInstructionsInput
): string[] {
  const parts = [renderSpecialistAppendix(input)];
  if (!input.topLevel) {
    parts.push(SPECIALIST_REPORT_INSTRUCTIONS);
  }
  return parts;
}
