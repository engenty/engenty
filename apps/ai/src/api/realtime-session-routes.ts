import { createHash } from "node:crypto";
import type { RealtimeVoiceTenantPrefs } from "@engenty/ai-core";
import { env } from "@engenty/telemetry";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
const DEFAULT_REALTIME_VOICE = "marin";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

const realtimeSessionBodySchema = z.object({
  instructions: z.string().trim().max(8000).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  voice: z.string().trim().min(1).max(80).optional(),
});

export interface RealtimeClientSecretResponse {
  expires_at?: number;
  session?: unknown;
  value: string;
}

export type RealtimeClientSecretFetch = typeof fetch;
export type RealtimeVoiceConfigResolver = (scope: {
  tenantId: string;
  userId: string;
}) => Promise<RealtimeVoiceTenantPrefs | null>;

export function readOpenAiApiKeyFromEnv(): string | null {
  return env(OPENAI_API_KEY_ENV, "") || null;
}

function openAiClientSecretFromPayload(payload: unknown): {
  expires_at: number | null;
  value: string;
} | null {
  if (!(payload && typeof payload === "object" && "value" in payload)) {
    return null;
  }
  const value = payload.value;
  if (typeof value !== "string") {
    return null;
  }
  const expiresAt =
    "expires_at" in payload && typeof payload.expires_at === "number"
      ? payload.expires_at
      : null;
  return { expires_at: expiresAt, value };
}

function openAiSafetyIdentifier(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export function registerRealtimeSessionRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    openAiApiKey?: () => string | null;
    openAiFetch?: RealtimeClientSecretFetch;
    realtimeVoiceConfig?: RealtimeVoiceConfigResolver | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  app.post(`${AI_BASE_PATH}/v1/realtime/sessions`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }

    const apiKey = opts.openAiApiKey
      ? opts.openAiApiKey()
      : readOpenAiApiKeyFromEnv();
    if (!apiKey) {
      return c.json({ error: "realtime.openaiApiKeyMissing" }, 503);
    }

    const body = realtimeSessionBodySchema.parse(
      await c.req.json().catch(() => ({}))
    );
    const voiceConfig =
      (await opts.realtimeVoiceConfig?.({
        tenantId: scope.scope.tenantId,
        userId: scope.scope.userId,
      })) ?? null;
    if (voiceConfig?.provider === "mistral") {
      return c.json({ error: "realtime.providerUnsupported" }, 501);
    }
    const model =
      body.model ?? voiceConfig?.openai_model ?? DEFAULT_REALTIME_MODEL;
    const transcriptionModel =
      voiceConfig?.openai_transcription_model ??
      DEFAULT_REALTIME_TRANSCRIPTION_MODEL;
    const voice =
      body.voice ?? voiceConfig?.openai_voice ?? DEFAULT_REALTIME_VOICE;
    const safetyIdentifier = openAiSafetyIdentifier([
      "engenty",
      scope.scope.tenantId,
      scope.scope.userId,
    ]);
    const response = await (opts.openAiFetch ?? fetch)(
      OPENAI_REALTIME_CLIENT_SECRETS_URL,
      {
        body: JSON.stringify({
          session: {
            type: "realtime",
            model,
            audio: {
              input: {
                transcription: {
                  model: transcriptionModel,
                },
              },
              output: { voice },
            },
            ...(body.instructions ? { instructions: body.instructions } : {}),
          },
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier,
        },
        method: "POST",
      }
    );

    const payload = (await response.json().catch(() => null)) as
      | RealtimeClientSecretResponse
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      return c.json(
        {
          error: "realtime.clientSecretFailed",
          message:
            payload && "error" in payload ? payload.error?.message : undefined,
        },
        502
      );
    }

    const clientSecret = openAiClientSecretFromPayload(payload);
    if (!clientSecret) {
      return c.json({ error: "realtime.invalidClientSecretResponse" }, 502);
    }

    return c.json({
      provider: "openai",
      model,
      transcription_model: transcriptionModel,
      voice,
      client_secret: clientSecret,
    });
  });
}
