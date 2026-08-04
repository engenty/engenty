import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { normalizeAllowedToolsInput } from "../allowed-tools.js";

const DEFAULT_AGENT_ROOT_SEGMENTS = [
  ["agents"],
  ["..", "..", "ai", "agents"],
] as const;

export const aiAgentManifestSchema = z.object({
  $schema: z.literal("engenty/ai-agent-manifest/v1"),
  description: z.string(),
  id: z.string(),
  /**
   * Sibling markdown files in the agent directory that appear in the
   * Instructions sidebar (e.g. `AGENTS.md`, `SOUL.md`, `SKILLS.md`).
   * Document keys are derived as `${id}.${basename}` → `engenty.copilot.soul`.
   * Default: `["AGENTS.md"]` when omitted.
   */
  instruction_files: z.array(z.string().min(1)).optional().default([]),
  instruction_keys: z.array(z.string()).optional().default([]),
  module_id: z.string(),
  name: z.string(),
  skills: z.array(z.string()),
  tools: z.array(z.string()),
});

export type AiAgentManifest = z.infer<typeof aiAgentManifestSchema>;

export interface AgentAssetLocator {
  agentId: string;
  candidateRootSegments?: readonly (readonly string[])[];
  importMetaUrl: string;
}

export function resolveAgentAssetDir(params: AgentAssetLocator): string {
  const here = dirname(fileURLToPath(params.importMetaUrl));
  const candidateRoots =
    params.candidateRootSegments ?? DEFAULT_AGENT_ROOT_SEGMENTS;

  for (const rootSegments of candidateRoots) {
    const dir = join(here, ...rootSegments, params.agentId);
    if (existsSync(join(dir, "agent.json"))) {
      return dir;
    }
  }

  throw new Error(
    `Could not find AI agent directory for ${params.agentId} relative to ${params.importMetaUrl}`
  );
}

export function readAgentTextAsset(
  params: AgentAssetLocator,
  filename: string
): string {
  return readFileSync(join(resolveAgentAssetDir(params), filename), "utf8");
}

export function readAgentJsonAsset<T>(
  params: AgentAssetLocator,
  filename: string
): T {
  return JSON.parse(readAgentTextAsset(params, filename)) as T;
}

export function loadAgentManifest(params: AgentAssetLocator): AiAgentManifest {
  const raw = readAgentJsonAsset<Record<string, unknown>>(params, "agent.json");
  const mergedSkills = normalizeAllowedToolsInput(
    (raw.skills ?? raw.skill_keys ?? raw["skill-keys"]) as
      | string
      | string[]
      | undefined
  );
  const next = { ...raw };
  next.skill_keys = undefined;
  next["skill-keys"] = undefined;
  return aiAgentManifestSchema.parse({
    ...next,
    skills: mergedSkills ?? [],
  });
}
