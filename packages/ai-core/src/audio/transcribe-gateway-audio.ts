import { createOpenAI } from "@ai-sdk/openai";
import { transcribe } from "ai";
import { readAiGatewayApiKeyFromEnv } from "../config/ai-gateway-api-key.js";
import {
  DEFAULT_MODEL_GATEWAY_ID,
  parseModelRef,
} from "../config/model-ref.js";
import { roleModelRef } from "../config/platform-bindings.js";

export const TRANSCRIPTION_MODEL_ROLE = "transcription";
const AI_GATEWAY_OPENAI_BASE_URL = "https://ai-gateway.vercel.sh/v1";

export class TranscribeGatewayAudioError extends Error {
  readonly code:
    | "missing_api_key"
    | "transcription_failed"
    | "unsupported_gateway";

  constructor(
    code: TranscribeGatewayAudioError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "TranscribeGatewayAudioError";
    this.code = code;
  }
}

export interface TranscribeGatewayAudioOptions {
  language?: string;
}

function resolveWhisperLanguage(language?: string): string | undefined {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  return normalized.split("-")[0] || undefined;
}

/**
 * The `transcription` role's model, as the gateway's OpenAI-compatible endpoint
 * names it: OpenAI models without their vendor prefix, others as-is. Only the
 * default gateway serves transcription.
 */
function resolveTranscriptionModelId(): string {
  const ref = parseModelRef(roleModelRef(TRANSCRIPTION_MODEL_ROLE));
  if (ref.gateway !== DEFAULT_MODEL_GATEWAY_ID) {
    throw new TranscribeGatewayAudioError(
      "unsupported_gateway",
      `The "Transcription" model role is bound to ${ref.gateway}; transcription only runs on the ${DEFAULT_MODEL_GATEWAY_ID} gateway.`
    );
  }
  return ref.modelId.startsWith("openai/")
    ? ref.modelId.slice("openai/".length)
    : ref.modelId;
}

async function toAudioPayload(
  audio: Blob | Uint8Array | ArrayBuffer
): Promise<Uint8Array | ArrayBuffer> {
  if (audio instanceof Blob) {
    return audio.arrayBuffer();
  }
  return audio;
}

export async function transcribeGatewayAudio(
  audio: Blob | Uint8Array | ArrayBuffer,
  options: TranscribeGatewayAudioOptions = {}
): Promise<{ text: string }> {
  const apiKey = readAiGatewayApiKeyFromEnv();
  if (!apiKey) {
    throw new TranscribeGatewayAudioError(
      "missing_api_key",
      "AI_GATEWAY_API_KEY is not configured"
    );
  }

  const openai = createOpenAI({
    apiKey,
    baseURL: AI_GATEWAY_OPENAI_BASE_URL,
  });

  const modelId = resolveTranscriptionModelId();
  try {
    const whisperLanguage = resolveWhisperLanguage(options.language);
    const result = await transcribe({
      model: openai.transcription(modelId),
      audio: await toAudioPayload(audio),
      providerOptions: whisperLanguage
        ? { openai: { language: whisperLanguage } }
        : undefined,
    });
    return { text: result.text.trim() };
  } catch (cause) {
    throw new TranscribeGatewayAudioError(
      "transcription_failed",
      cause instanceof Error ? cause.message : "Transcription failed",
      { cause }
    );
  }
}
