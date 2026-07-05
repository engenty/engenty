import { createHash } from "node:crypto";
import {
  type RealtimeSessionDescriptor,
  RealtimeSessionError,
  type RealtimeSessionRequest,
  type RealtimeSessionScope,
  type RealtimeVoiceProvider,
  type RealtimeVoiceTenantPrefs,
} from "@engenty/ai-core";
import { env } from "@engenty/telemetry";

const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
const DEFAULT_REALTIME_VOICE = "marin";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

export type RealtimeClientSecretFetch = typeof fetch;

export interface RealtimeClientSecretResponse {
  expires_at?: number;
  session?: unknown;
  value: string;
}

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

export interface CreateOpenAiRealtimeProviderOptions {
  apiKey?: () => string | null;
  fetchImpl?: RealtimeClientSecretFetch;
}

export function createOpenAiRealtimeProvider({
  apiKey = readOpenAiApiKeyFromEnv,
  fetchImpl = fetch,
}: CreateOpenAiRealtimeProviderOptions = {}): RealtimeVoiceProvider {
  return {
    id: "openai",
    async createSession(
      scope: RealtimeSessionScope,
      request: RealtimeSessionRequest,
      prefs: RealtimeVoiceTenantPrefs | null
    ): Promise<RealtimeSessionDescriptor> {
      const key = apiKey();
      if (!key) {
        throw new RealtimeSessionError(503, "realtime.openaiApiKeyMissing");
      }

      const model =
        request.model ?? prefs?.openai_model ?? DEFAULT_REALTIME_MODEL;
      const transcriptionModel =
        prefs?.openai_transcription_model ??
        DEFAULT_REALTIME_TRANSCRIPTION_MODEL;
      const voice =
        request.voice ?? prefs?.openai_voice ?? DEFAULT_REALTIME_VOICE;
      const safetyIdentifier = openAiSafetyIdentifier([
        "engenty",
        scope.tenantId,
        scope.userId,
      ]);

      const response = await fetchImpl(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
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
            ...(request.instructions
              ? { instructions: request.instructions }
              : {}),
          },
        }),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier,
        },
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | RealtimeClientSecretResponse
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        throw new RealtimeSessionError(
          502,
          "realtime.clientSecretFailed",
          payload && "error" in payload ? payload.error?.message : undefined
        );
      }

      const clientSecret = openAiClientSecretFromPayload(payload);
      if (!clientSecret) {
        throw new RealtimeSessionError(
          502,
          "realtime.invalidClientSecretResponse"
        );
      }

      return {
        kind: "webrtc-direct",
        provider: "openai",
        model,
        transcription_model: transcriptionModel,
        voice,
        client_secret: clientSecret,
      };
    },
  };
}
