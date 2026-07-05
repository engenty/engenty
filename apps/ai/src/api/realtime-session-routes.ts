import {
  composeVoiceInstructions,
  RealtimeSessionError,
  type RealtimeVoiceTenantPrefs,
} from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import { type AiScopeResolver, resolveScope } from "./http.js";
import {
  createOpenAiRealtimeProvider,
  type RealtimeClientSecretFetch,
} from "./providers/openai-realtime.js";
import { createRealtimeProviderRegistry } from "./realtime-providers.js";

export {
  type RealtimeClientSecretFetch,
  type RealtimeClientSecretResponse,
  readOpenAiApiKeyFromEnv,
} from "./providers/openai-realtime.js";

const realtimeSessionBodySchema = z.object({
  instructions: z.string().trim().max(8000).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  voice: z.string().trim().min(1).max(80).optional(),
});

export type RealtimeVoiceConfigResolver = (scope: {
  tenantId: string;
  userId: string;
}) => Promise<RealtimeVoiceTenantPrefs | null>;

export function registerRealtimeSessionRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    openAiApiKey?: () => string | null;
    openAiFetch?: RealtimeClientSecretFetch;
    realtimeVoiceConfig?: RealtimeVoiceConfigResolver | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  const registry = createRealtimeProviderRegistry([
    createOpenAiRealtimeProvider({
      apiKey: opts.openAiApiKey,
      fetchImpl: opts.openAiFetch,
    }),
  ]);

  app.post(`${AI_BASE_PATH}/v1/realtime/sessions`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }

    const body = realtimeSessionBodySchema.parse(
      await c.req.json().catch(() => ({}))
    );
    const voiceConfig =
      (await opts.realtimeVoiceConfig?.({
        tenantId: scope.scope.tenantId,
        userId: scope.scope.userId,
      })) ?? null;

    const provider = registry.resolve(voiceConfig?.provider);
    if (!provider) {
      return c.json({ error: "realtime.providerUnsupported" }, 501);
    }

    try {
      const descriptor = await provider.createSession(
        { tenantId: scope.scope.tenantId, userId: scope.scope.userId },
        {
          ...body,
          instructions: composeVoiceInstructions(
            body.instructions,
            voiceConfig?.voice_register
          ),
        },
        voiceConfig
      );
      return c.json(descriptor);
    } catch (error) {
      if (error instanceof RealtimeSessionError) {
        return c.json(
          {
            error: error.code,
            ...(error.message && error.message !== error.code
              ? { message: error.message }
              : {}),
          },
          // Provider failures are 5xx; Hono's json() wants a known status type.
          error.status as 502 | 503
        );
      }
      throw error;
    }
  });
}
