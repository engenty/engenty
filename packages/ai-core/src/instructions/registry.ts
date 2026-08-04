import type { InstructionDocumentDefinition } from "../contracts.js";
import { listActiveAiRegistrations } from "../registry.js";
import {
  readCopilotAgentsMarkdown,
  readCopilotSkillsMarkdown,
  readCopilotSoulMarkdown,
} from "./copilot-seed-files.js";

/** DB / instruction-store key for `modules/engenty-copilot/.../AGENTS.md`. */
export const ENGENTY_COPILOT_AGENTS_KEY = "engenty.copilot.agents";
/** DB / instruction-store key for `modules/engenty-copilot/.../SOUL.md`. */
export const ENGENTY_COPILOT_SOUL_KEY = "engenty.copilot.soul";
/** DB / instruction-store key for `modules/engenty-copilot/.../SKILLS.md`. */
export const ENGENTY_COPILOT_SKILLS_KEY = "engenty.copilot.skills";

export function createEngentyCopilotInstructionDocuments(): InstructionDocumentDefinition[] {
  // Fresh bodies each call — seeds can change across rebuilds without process restart.
  return [
    {
      id: ENGENTY_COPILOT_AGENTS_KEY,
      filename: "AGENTS.md",
      module_id: "engenty",
      owner_id: "engenty.copilot",
      owner_kind: "agent",
      key: ENGENTY_COPILOT_AGENTS_KEY,
      title: "Engenty copilot — agent instructions",
      default_body: readCopilotAgentsMarkdown(),
      layer: "agent",
    },
    {
      id: ENGENTY_COPILOT_SOUL_KEY,
      filename: "SOUL.md",
      module_id: "engenty",
      owner_id: "engenty.copilot",
      owner_kind: "agent",
      key: ENGENTY_COPILOT_SOUL_KEY,
      title: "Engenty copilot — soul",
      default_body: readCopilotSoulMarkdown(),
      layer: "agent",
    },
    {
      id: ENGENTY_COPILOT_SKILLS_KEY,
      filename: "SKILLS.md",
      module_id: "engenty",
      owner_id: "engenty.copilot",
      owner_kind: "agent",
      key: ENGENTY_COPILOT_SKILLS_KEY,
      title: "Engenty copilot — skills doctrine",
      default_body: readCopilotSkillsMarkdown(),
      layer: "agent",
    },
  ];
}

export function listRegisteredInstructionDocuments(): InstructionDocumentDefinition[] {
  return listActiveAiRegistrations().flatMap(
    (registration) => registration.instruction_documents ?? []
  );
}

export function resolveRegisteredInstructionDocumentByKey(
  key: string
): InstructionDocumentDefinition | undefined {
  return listRegisteredInstructionDocuments().find(
    (document) => document.key === key
  );
}
