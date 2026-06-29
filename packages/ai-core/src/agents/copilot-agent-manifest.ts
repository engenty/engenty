/**
 * Declarative metadata for `engenty.copilot`
 * (see `modules/engenty-copilot/ai/agents/engenty.copilot/agent.json`).
 */

import { copilotAgentAssetLocator } from "../instructions/copilot-seed-files.js";
import {
  type AiAgentManifest,
  aiAgentManifestSchema,
  loadAgentManifest,
} from "./agent-manifest.js";

export const copilotAgentManifestSchema = aiAgentManifestSchema;

export type CopilotAgentManifest = AiAgentManifest;

let cached: CopilotAgentManifest | null = null;

export function getEngentyCopilotAgentManifest(): CopilotAgentManifest {
  if (cached) {
    return cached;
  }
  cached = loadAgentManifest(copilotAgentAssetLocator);
  return cached;
}

/** Test-only: reset cached manifest. */
export function resetEngentyCopilotAgentManifestCache(): void {
  cached = null;
}
