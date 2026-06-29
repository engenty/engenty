import {
  appsAiRequestHeaders,
  normalizeAppsAiServiceBaseUrl,
  resolveEngentyAiServiceBaseUrl,
} from "./apps-ai-api.js";

const APPS_AI_TRANSCRIPTIONS_PATH = "/ai/v1/audio/transcriptions";

export interface TranscribeAudioViaAppsAiOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  language?: string;
  signal?: AbortSignal;
}

export async function transcribeAudioViaAppsAi(
  audio: Blob,
  options: TranscribeAudioViaAppsAiOptions = {}
): Promise<string> {
  const baseUrl = options.baseUrl ?? resolveEngentyAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Engenty AI service base URL is not configured");
  }

  const formData = new FormData();
  formData.append("file", audio, "audio.webm");
  if (options.language) {
    formData.append("language", options.language);
  }

  const headers = {
    ...(options.headers ?? (await appsAiRequestHeaders())),
  };

  const response = await fetch(
    `${normalizeAppsAiServiceBaseUrl(baseUrl)}${APPS_AI_TRANSCRIPTIONS_PATH}`,
    {
      body: formData,
      headers,
      method: "POST",
      signal: options.signal,
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Transcription failed (${response.status})`
    );
  }

  const payload = (await response.json()) as { text?: string };
  return payload.text?.trim() ?? "";
}
