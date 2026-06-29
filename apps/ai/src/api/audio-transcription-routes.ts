import { transcribeGatewayAudio } from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export function registerAudioTranscriptionRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: { scopeResolver: AiScopeResolver }
): void {
  app.post(`${AI_BASE_PATH}/v1/audio/transcriptions`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }

    try {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) {
        return c.json({ error: "file is required" }, 400);
      }
      if (file.size === 0) {
        return c.json({ error: "file is empty" }, 400);
      }
      if (file.size > MAX_AUDIO_BYTES) {
        return c.json({ error: "file is too large" }, 413);
      }

      const language =
        typeof body.language === "string" && body.language.trim().length > 0
          ? body.language.trim()
          : undefined;

      const result = await transcribeGatewayAudio(await file.arrayBuffer(), {
        language,
      });
      return c.json({ text: result.text });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });
}
