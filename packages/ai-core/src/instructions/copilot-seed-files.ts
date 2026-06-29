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
  ["..", "..", "..", "..", "modules", "engenty-copilot", "ai", "agents"],
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
