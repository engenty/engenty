/**
 * Load repo-authored markdown for `engenty.copilot` instruction seeds.
 * Resolves paths for both `dist/` (bundled entry) and `src/instructions/` (tests / tsx).
 */
import {
  type AgentAssetLocator,
  readAgentTextAsset,
  resolveAgentAssetDir,
} from "../agents/agent-manifest.js";

const COPILOT_AGENT_ROOT_SEGMENTS = [
  // Bundled entry: packages/ai-core/dist/index.js → engenty-pro/modules/...
  ["..", "..", "..", "modules", "engenty-copilot", "ai", "agents"],
  // Same when consumed from a nested dist chunk under packages/ai-core/dist/
  ["..", "..", "..", "..", "modules", "engenty-copilot", "ai", "agents"],
  // Source file: packages/ai-core/src/instructions/*.ts
  ["..", "..", "..", "..", "modules", "engenty-copilot", "ai", "agents"],
  // Vitest / tsx from packages/ai-core/src/instructions/__tests__/
  ["..", "..", "..", "..", "..", "modules", "engenty-copilot", "ai", "agents"],
  // Prefer the built module package when workspace layout differs
  ["..", "..", "..", "modules", "engenty-copilot", "dist", "ai", "agents"],
  ["..", "..", "..", "..", "modules", "engenty-copilot", "dist", "ai", "agents"],
] as const;

export const copilotAgentAssetLocator: AgentAssetLocator = {
  agentId: "engenty.copilot",
  candidateRootSegments: COPILOT_AGENT_ROOT_SEGMENTS,
  importMetaUrl: import.meta.url,
};

/** Canonical `modules/engenty-copilot/ai/agents/engenty.copilot/` (AGENTS.md, SOUL.md, agent.json). */
export function resolveCopilotAgentDir(): string {
  return resolveAgentAssetDir(copilotAgentAssetLocator);
}

export function readCopilotAgentsMarkdown(): string {
  return readAgentTextAsset(copilotAgentAssetLocator, "AGENTS.md");
}

export function readCopilotSoulMarkdown(): string {
  return readAgentTextAsset(copilotAgentAssetLocator, "SOUL.md");
}

export function readCopilotSkillsMarkdown(): string {
  return readAgentTextAsset(copilotAgentAssetLocator, "SKILLS.md");
}

/** Read any sibling markdown seed next to engenty.copilot/agent.json. */
export function readCopilotInstructionFile(filename: string): string {
  return readAgentTextAsset(copilotAgentAssetLocator, filename);
}
