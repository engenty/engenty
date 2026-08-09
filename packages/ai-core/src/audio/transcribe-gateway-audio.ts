import { createOpenAI } from "@ai-sdk/openai";
import { transcribe } from "ai";
import { readAiGatewayApiKeyFromEnv } from "../config/ai-gateway-api-key.js";

const DEFAULT_WHISPER_MODEL = "whisper-1";
const AI_GATEWAY_OPENAI_BASE_URL = "https://ai-gateway.vercel.sh/v1";

export class TranscribeGatewayAudioError extends Error {
  readonly code: "missing_api_key" | "transcription_failed";

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
  modelId?: string;
}

function resolveWhisperLanguage(language?: string): string | undefined {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  return normalized.split("-")[0] || undefined;
}

function resolveWhisperModelId(modelId?: string): string {
  const raw = modelId?.trim() || `openai/${DEFAULT_WHISPER_MODEL}`;
  if (raw.includes("/")) {
    const [, modelName] = raw.split("/", 2);
    return modelName || DEFAULT_WHISPER_MODEL;
  }
  return raw;
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

  try {
    const whisperLanguage = resolveWhisperLanguage(options.language);
    const result = await transcribe({
      model: openai.transcription(resolveWhisperModelId(options.modelId)),
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
