// The standing appendix of every specialist lives with the rest of the
// hired-engenty code in modules/engenty-specialists (ai/instructions/
// SPECIALIST.md + REPORT.md). apps/ai composes in what is its own: the
// memory and tasks instructions bound to the run's MEMORY.md / TASKS.md.
import {
  renderSpecialistAppendix,
  specialistInstructionParts,
} from "@engenty/engenty-specialists/ai";
import { AGENT_MEMORY_INSTRUCTIONS } from "../memory/agent-memory.js";
import { AGENT_TASKS_INSTRUCTIONS } from "../memory/agent-tasks.js";

export { SPECIALIST_REPORT_INSTRUCTIONS } from "@engenty/engenty-specialists/ai";

export const SPECIALIST_INSTRUCTIONS: string = renderSpecialistAppendix({
  memory: AGENT_MEMORY_INSTRUCTIONS,
  tasks: AGENT_TASKS_INSTRUCTIONS,
});

/**
 * The prompt sections a specialist run carries: the appendix, and for a
 * report the hand-over to its coordinator. The module decides which.
 */
export function specialistInstructionsForRun(input: {
  topLevel: boolean;
}): string[] {
  return specialistInstructionParts({
    memory: AGENT_MEMORY_INSTRUCTIONS,
    tasks: AGENT_TASKS_INSTRUCTIONS,
    topLevel: input.topLevel,
  });
}
