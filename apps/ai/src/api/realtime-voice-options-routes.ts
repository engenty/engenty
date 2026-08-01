import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { AI_BASE_PATH } from "../config/constants.js";
import { type AiScopeResolver, resolveScope } from "./http.js";
import {
  readElevenLabsApiKeyFromEnv,
  readMistralApiKeyFromEnv,
} from "./providers/voxtral-elevenlabs.js";
import {
  buildRealtimeVoiceOptions,
  type ElevenLabsVoicesFetch,
} from "./realtime-voice-options.js";

export function registerRealtimeVoiceOptionsRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    elevenLabsApiKey?: () => string | null;
    elevenLabsFetch?: ElevenLabsVoicesFetch;
    mistralApiKey?: () => string | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  app.get(`${AI_BASE_PATH}/v1/realtime/voice-options`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }

    const body = await buildRealtimeVoiceOptions({
      elevenLabsApiKey: (
        opts.elevenLabsApiKey ?? readElevenLabsApiKeyFromEnv
      )(),
      fetchImpl: opts.elevenLabsFetch,
      mistralApiKey: (opts.mistralApiKey ?? readMistralApiKeyFromEnv)(),
    });
    return c.json(body);
  });
}
