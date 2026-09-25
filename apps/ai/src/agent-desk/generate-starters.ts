import { createHash } from "node:crypto";
import {
  AGENT_STARTER_MAX,
  type AgentConfig,
  type ResolvedAgentStarter,
  readAiGatewayApiKeyFromEnv,
  resolvePurposeModelId,
  resolveSkillDefinitionById,
  type TenantAiSettings,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";
import type {
  EngentySpace,
  EngentySpaceSurface,
} from "../ai/core-http-client.js";
import type { ThreadRow } from "../dal/threads/types.js";
import { TtlLruCache } from "./starter-cache.js";
import { parseGeneratedStarterLines } from "./starter-lines.js";

const logger = createLogger({ name: "apps/ai/agent-desk-starters" });

export const GENERATED_STARTERS_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 256;
const MAX_INSTRUCTIONS_CHARS = 800;
const MAX_SKILL_SUMMARY_CHARS = 160;
const MAX_FIRST_MESSAGES = 15;

const generatedStartersCache = new TtlLruCache<ResolvedAgentStarter[]>(
  CACHE_MAX,
  CACHE_TTL_MS
);

/** Test helper — the cache is process-wide so specs must reset it. */
export function resetGeneratedStartersCacheForTests(): void {
  generatedStartersCache.clear();
}

const SYSTEM_PROMPT = [
  "You write empty-state starter chips for an AI specialist's start page.",
  "Each starter is a job the agent can actually do with its tools and skills, not a greeting.",
  "Chip label ≤ 40 characters. Prompt is one full sentence. Both in the requested locale.",
  "Do not repeat a declared starter.",
  `Answer with at most ${String(AGENT_STARTER_MAX)} lines, one starter per line, formatted exactly as:`,
  "<label> | <prompt>",
  "No numbering, no headings, no JSON, nothing else.",
].join("\n");

export interface GenerateAgentDeskStartersDependencies {
  generate?: (input: {
    modelId: string;
    prompt: string;
  }) => Promise<ResolvedAgentStarter[]>;
  getAgent: (agentId: string) => Promise<AgentConfig | undefined>;
  getSpaceSurface: (spaceId: string) => Promise<EngentySpaceSurface>;
  getTenantSettings: () => Promise<TenantAiSettings>;
  listFirstUserMessages: (input: {
    agentId: string;
    spaceId: string;
    threads: ThreadRow[];
  }) => Promise<string[]>;
  listSpaces: () => Promise<EngentySpace[]>;
  listThreads: (input: {
    agentId: string;
    limit: number;
    spaceId: string;
  }) => Promise<ThreadRow[]>;
}

export async function generateAgentDeskStarters(input: {
  agentId: string;
  dependencies: GenerateAgentDeskStartersDependencies;
  locale: string;
  spaceId: string;
  tenantId: string;
  /**
   * The viewer. Part of the cache key because the prompt is seeded from
   * `listFirstUserMessages`, and for a personal-scope agent that history is
   * this user's alone — a tenant-wide key would show one user's chips,
   * derived from their private threads, to the next person in the space.
   */
  userId: string;
}): Promise<{ enabled: boolean; starters: ResolvedAgentStarter[] }> {
  const { dependencies, agentId, spaceId } = input;
  const settings = await dependencies.getTenantSettings();
  if (settings.generated_starters !== true) {
    return { enabled: false, starters: [] };
  }
  if (!(dependencies.generate || readAiGatewayApiKeyFromEnv())) {
    return { enabled: true, starters: [] };
  }

  const [surface, spaces, agent] = await Promise.all([
    dependencies.getSpaceSurface(spaceId),
    dependencies.listSpaces(),
    dependencies.getAgent(agentId),
  ]);
  if (!(agent && surface.agents.includes(agentId))) {
    return { enabled: true, starters: [] };
  }
  const threads = await dependencies.listThreads({
    agentId,
    limit: 200,
    spaceId,
  });
  const fingerprint = starterCacheFingerprint({
    agent,
    locale: input.locale,
    spaceId,
    surface,
    tenantId: input.tenantId,
    threadCount: threads.length,
    userId: input.userId,
  });
  const cacheKey = fingerprint;
  const cached = generatedStartersCache.get(cacheKey);
  if (cached && !cached.stale) {
    return { enabled: true, starters: cached.value };
  }

  const refresh = async (): Promise<ResolvedAgentStarter[]> => {
    const firstMessages = await dependencies
      .listFirstUserMessages({
        agentId,
        spaceId,
        threads: threads.slice(0, 15),
      })
      .catch(() => []);
    const spaceName =
      spaces.find((space) => space.id === spaceId)?.name ?? spaceId;
    const modelId = resolvePurposeModelId({
      purpose: "fast_text",
      tenantDefault: settings.fast_text_model_id,
    });
    const prompt = buildGeneratedStartersPrompt({
      agent,
      firstMessages,
      locale: input.locale,
      spaceName,
      surface,
    });
    const generated = await Promise.race([
      (dependencies.generate ?? callGeneratedStartersModel)({
        modelId,
        prompt,
      }),
      sleepReject(GENERATED_STARTERS_TIMEOUT_MS),
    ]);
    generatedStartersCache.set(cacheKey, generated);
    return generated;
  };

  if (cached?.stale) {
    void refresh().catch((error: unknown) => {
      logger.debug("generated starters refresh skipped", {
        agent_id: agentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return { enabled: true, starters: cached.value };
  }

  try {
    return { enabled: true, starters: await refresh() };
  } catch (error) {
    logger.debug("generated starters skipped", {
      agent_id: agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { enabled: true, starters: [] };
  }
}

export function starterCacheFingerprint(input: {
  agent: Pick<
    AgentConfig,
    "id" | "instructions" | "name" | "skillIds" | "starters" | "toolIds"
  >;
  locale: string;
  spaceId: string;
  surface: Pick<EngentySpaceSurface, "connectors" | "modules">;
  tenantId: string;
  threadCount: number;
  userId: string;
}): string {
  const threadBucket =
    input.threadCount < 1
      ? "0"
      : input.threadCount < 6
        ? "1-5"
        : input.threadCount < 21
          ? "6-20"
          : "21+";
  const payload = JSON.stringify({
    agent: {
      id: input.agent.id,
      instructions: input.agent.instructions.slice(0, MAX_INSTRUCTIONS_CHARS),
      name: input.agent.name,
      skillIds: input.agent.skillIds,
      starters: (input.agent.starters ?? []).map((starter) => starter.id),
      toolIds: input.agent.toolIds,
    },
    connectors: [...(input.surface.connectors ?? [])].toSorted(),
    locale: input.locale,
    modules: input.surface.modules
      .filter((module) => module.agentAccess !== "none")
      .map((module) => module.moduleId)
      .toSorted(),
    spaceId: input.spaceId,
    tenantId: input.tenantId,
    threadBucket,
    userId: input.userId,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function skillSummaries(skillIds: readonly string[]): string[] {
  return skillIds.map((id) => {
    const description =
      resolveSkillDefinitionById(id)?.description?.trim() ?? "";
    const summary = description.slice(0, MAX_SKILL_SUMMARY_CHARS);
    return summary ? `${id}: ${summary}` : id;
  });
}

function buildGeneratedStartersPrompt(input: {
  agent: AgentConfig;
  firstMessages: readonly string[];
  locale: string;
  spaceName: string;
  surface: EngentySpaceSurface;
}): string {
  const declared = (input.agent.starters ?? [])
    .map((starter) => starter.label)
    .join(" | ");
  const modules = input.surface.modules
    .filter((module) => module.agentAccess !== "none")
    .map((module) => `${module.moduleId}:${module.agentAccess}`)
    .join(", ");
  return [
    `Locale: ${input.locale}`,
    `Space: ${input.spaceName}`,
    `Agent: ${input.agent.name} (${input.agent.id})`,
    `Description: ${(input.agent.description ?? "").slice(0, 400)}`,
    `Instructions: ${input.agent.instructions.slice(0, MAX_INSTRUCTIONS_CHARS)}`,
    `Skills: ${skillSummaries(input.agent.skillIds).join(" | ") || "none"}`,
    `Tools: ${input.agent.toolIds.join(", ") || "none"}`,
    `Mounted connectors: ${(input.surface.connectors ?? []).join(", ") || "none"}`,
    `Mounted modules: ${modules || "none"}`,
    `Declared starters (do not repeat): ${declared || "none"}`,
    `Recent first messages:\n${
      input.firstMessages
        .slice(0, MAX_FIRST_MESSAGES)
        .map((text) => `- ${text.slice(0, 160)}`)
        .join("\n") || "- (none)"
    }`,
  ].join("\n");
}

async function callGeneratedStartersModel(input: {
  modelId: string;
  prompt: string;
}): Promise<ResolvedAgentStarter[]> {
  const { text } = await generateText({
    instructions: SYSTEM_PROMPT,
    maxOutputTokens: 800,
    model: input.modelId,
    prompt: input.prompt,
    temperature: 0.3,
  });
  return parseGeneratedStarterLines(text, AGENT_STARTER_MAX);
}

function sleepReject(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error("generated_starters_timeout")),
      timeoutMs
    );
  });
}

export function firstUserTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  for (const part of parts) {
    if (!part || typeof part !== "object" || !("text" in part)) {
      continue;
    }
    const text = (part as { text: unknown }).text;
    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }
  return "";
}
