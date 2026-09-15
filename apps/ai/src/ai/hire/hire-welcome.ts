import {
  readAiGatewayApiKeyFromEnv,
  resolvePurposeModelId,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";
import type { ThreadStore } from "../../dal/threads/thread-store.js";
import {
  EngentyCoreClient,
  type EngentySpaceSurface,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import { createThreadStoreFromEnv } from "../index.js";
import type { AgentConfig } from "../registry/types.js";
import type { AiSessionScope } from "../sessions/types.js";
import { scopeAccessToken } from "../sessions.js";
import { speakOnDesk } from "../threads/speak-on-desk.js";
import { resolveSpecialistChatThread } from "../threads/specialist-chat-thread.js";
import { stableUuid } from "../workflows/dispatch-published-run.js";
import {
  fallbackHireWelcome,
  HIRE_WELCOME_SOURCE,
  type HireWelcomeContext,
  hireWelcomeSystemPrompt,
  hireWelcomeUserPrompt,
} from "./hire-welcome-text.js";

export { HIRE_WELCOME_SOURCE } from "./hire-welcome-text.js";

const logger = createLogger({ name: "apps/ai/hire-welcome" });

export const HIRE_WELCOME_TIMEOUT_MS = 4000;

export interface EnsureHireWelcomeInput {
  accessToken?: string | null;
  agent: Pick<AgentConfig, "description" | "id" | "instructions" | "name">;
  generate?: (input: {
    modelId: string;
    prompt: string;
    locale: string;
  }) => Promise<string>;
  getSpaceSurface?: (spaceId: string) => Promise<EngentySpaceSurface>;
  listSpaces?: () => Promise<{ id: string; name: string }[]>;
  locale: string;
  ownerUserId: string;
  spaceId: string;
  store?: ThreadStore | null;
  tenantId: string;
}

function sleepReject(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("hire_welcome_timeout")), timeoutMs);
  });
}

async function callHireWelcomeModel(input: {
  locale: string;
  modelId: string;
  prompt: string;
}): Promise<string> {
  const { text } = await generateText({
    instructions: hireWelcomeSystemPrompt(input.locale),
    maxOutputTokens: 400,
    model: input.modelId,
    prompt: input.prompt,
    temperature: 0.6,
  });
  return text.trim();
}

function contextFromSurface(input: {
  agent: EnsureHireWelcomeInput["agent"];
  locale: string;
  spaceName: string;
  surface: EngentySpaceSurface | null;
}): HireWelcomeContext {
  return {
    connectors: input.surface?.connectors ?? [],
    description: input.agent.description?.trim() || "",
    locale: input.locale,
    modules: (input.surface?.modules ?? [])
      .filter((module) => module.agentAccess !== "none")
      .map((module) => module.moduleId),
    name: input.agent.name.trim() || input.agent.id,
    spaceName: input.spaceName,
  };
}

/** The model's version of the welcome, or null when there is no model to ask. */
async function generateWelcomeText(
  input: EnsureHireWelcomeInput,
  context: HireWelcomeContext
): Promise<string | null> {
  if (!(input.generate || readAiGatewayApiKeyFromEnv())) {
    return null;
  }
  const modelId = resolvePurposeModelId({
    purpose: "routing",
    readEnv: (key) => process.env[key],
  });
  try {
    const text = await Promise.race([
      (input.generate ?? callHireWelcomeModel)({
        locale: input.locale,
        modelId,
        prompt: hireWelcomeUserPrompt(context),
      }),
      sleepReject(HIRE_WELCOME_TIMEOUT_MS),
    ]);
    return text.trim() || null;
  } catch (error) {
    logger.warn("hire welcome generation failed; keeping the fallback", {
      agentId: input.agent.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Open this Engenty's desk conversation and leave a first message, so a hire
 * is not silent (and therefore not "inactive") on the Space home.
 *
 * Idempotent: a desk that already has words is left alone.
 *
 * Order matters more than prose: the row is written at once with the fallback
 * text and `created_at` pinned to the thread's own creation, THEN the model
 * is asked for a better version, which replaces the text on the same row. A
 * person who starts typing the moment the hire lands used to beat the ≤4s
 * generation to the desk, and the welcome then read as a reply to them.
 */
export async function ensureHireWelcome(
  input: EnsureHireWelcomeInput
): Promise<{ created: boolean; threadId: string } | null> {
  const store = input.store ?? createThreadStoreFromEnv();
  if (!(store && input.ownerUserId && input.spaceId && input.agent.id)) {
    return null;
  }
  const threadId = await resolveSpecialistChatThread({
    agentId: input.agent.id,
    ownerUserId: input.ownerUserId,
    spaceId: input.spaceId,
    store,
    tenantId: input.tenantId,
    threadSeed: `hire-welcome:${input.tenantId}:${input.spaceId}:${input.agent.id}`,
    title: input.agent.name.trim() || input.agent.id,
  });
  if (!threadId) {
    return null;
  }
  const [existing, thread] = await Promise.all([
    store.listMessagesOrdered({
      latest: true,
      limit: 1,
      tenantId: input.tenantId,
      threadId,
    }),
    store.getThread({ tenantId: input.tenantId, threadId }),
  ]);
  if (existing.length > 0) {
    return { created: false, threadId };
  }
  const createdAt = thread?.created_at ?? new Date().toISOString();

  let surface: EngentySpaceSurface | null = null;
  let spaceName = input.spaceId;
  try {
    const [resolvedSurface, spaces] = await Promise.all([
      input.getSpaceSurface?.(input.spaceId) ?? Promise.resolve(null),
      input.listSpaces?.() ?? Promise.resolve([]),
    ]);
    surface = resolvedSurface;
    spaceName =
      spaces.find((space) => space.id === input.spaceId)?.name ?? spaceName;
  } catch (error) {
    logger.warn("hire welcome could not load space surface", {
      error: error instanceof Error ? error.message : String(error),
      spaceId: input.spaceId,
    });
  }

  const context = contextFromSurface({
    agent: input.agent,
    locale: input.locale,
    spaceName,
    surface,
  });
  const messageId = stableUuid(`hire-welcome:${threadId}`);
  // Through the one desk door; the thread already exists, so the seed and
  // owner only name the room it resolves to.
  await speakOnDesk({
    agentId: input.agent.id,
    agentName: input.agent.name,
    createdAt,
    messageId,
    ownerUserId: input.ownerUserId,
    source: HIRE_WELCOME_SOURCE,
    spaceId: input.spaceId,
    store,
    tenantId: input.tenantId,
    text: fallbackHireWelcome(context),
    threadSeed: `hire-welcome:${input.tenantId}:${input.spaceId}:${input.agent.id}`,
  });
  const generated = await generateWelcomeText(input, context);
  if (generated) {
    try {
      await store.updateMessageParts({
        messageId,
        parts: [{ text: generated, type: "text" }],
        tenantId: input.tenantId,
        threadId,
      });
    } catch (error) {
      logger.warn("hire welcome text upgrade failed; fallback stays", {
        agentId: input.agent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { created: true, threadId };
}

export async function welcomeHiredAgentOnSpaces(input: {
  agent: EnsureHireWelcomeInput["agent"];
  locale: string;
  scope: AiSessionScope;
  spaceIds: readonly string[];
}): Promise<{ spaceId: string; threadId: string }[]> {
  const accessToken = scopeAccessToken(input.scope);
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const core =
    accessToken && coreBaseUrl
      ? new EngentyCoreClient({ accessToken, coreBaseUrl })
      : null;
  const welcomed: { spaceId: string; threadId: string }[] = [];
  for (const spaceId of input.spaceIds) {
    try {
      const result = await ensureHireWelcome({
        accessToken,
        agent: input.agent,
        locale: input.locale,
        ownerUserId: input.scope.userId,
        spaceId,
        tenantId: input.scope.tenantId,
        ...(core
          ? {
              getSpaceSurface: (id) => core.getSpaceSurface(id),
              listSpaces: () => core.listSpaces(),
            }
          : {}),
      });
      if (result) {
        welcomed.push({ spaceId, threadId: result.threadId });
      }
    } catch (error) {
      logger.warn("hire welcome failed", {
        agentId: input.agent.id,
        error: error instanceof Error ? error.message : String(error),
        spaceId,
      });
    }
  }
  return welcomed;
}
