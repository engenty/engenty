import { afterEach, describe, expect, it, vi } from "vitest";
import { bindingsFromList } from "../config/model-roles.js";
import { setPlatformBindings } from "../config/platform-bindings-snapshot.js";
import {
  TranscribeGatewayAudioError,
  transcribeGatewayAudio,
} from "./transcribe-gateway-audio.js";

function bindTranscription(gateway: string, modelId: string) {
  setPlatformBindings(
    bindingsFromList([{ gateway, modelId, role: "transcription" }])
  );
}

vi.mock("ai", () => ({
  transcribe: vi.fn(async () => ({ text: " hello " })),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    transcription: vi.fn((model: string) => ({ modelId: model })),
  })),
}));

describe("transcribeGatewayAudio", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setPlatformBindings(undefined);
  });

  it("throws when gateway key is missing", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    await expect(
      transcribeGatewayAudio(new Uint8Array([1, 2, 3]))
    ).rejects.toMatchObject({
      code: "missing_api_key",
    });
  });

  it("returns trimmed text from gateway transcription", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    bindTranscription("vercel", "openai/whisper-1");
    await expect(
      transcribeGatewayAudio(new Uint8Array([1, 2, 3]))
    ).resolves.toEqual({ text: "hello" });
  });

  it("sends the bound model, OpenAI ids without their vendor prefix", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const { transcribe } = await import("ai");
    bindTranscription("vercel", "openai/gpt-4o-transcribe");
    await transcribeGatewayAudio(new Uint8Array([1]));
    bindTranscription("vercel", "google/gemini-3.5-transcribe");
    await transcribeGatewayAudio(new Uint8Array([1]));
    const models = vi
      .mocked(transcribe)
      .mock.calls.slice(-2)
      .map(([call]) => (call.model as unknown as { modelId: string }).modelId);
    expect(models).toEqual([
      "gpt-4o-transcribe",
      "google/gemini-3.5-transcribe",
    ]);
  });

  it("refuses a binding off the Vercel gateway", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    bindTranscription("openai", "openai/whisper-1");
    await expect(
      transcribeGatewayAudio(new Uint8Array([1]))
    ).rejects.toMatchObject({ code: "unsupported_gateway" });
  });

  it("wraps transcription failures", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    bindTranscription("vercel", "openai/whisper-1");
    const { transcribe } = await import("ai");
    vi.mocked(transcribe).mockRejectedValueOnce(new Error("gateway down"));

    await expect(
      transcribeGatewayAudio(new Uint8Array([1, 2, 3]))
    ).rejects.toBeInstanceOf(TranscribeGatewayAudioError);
  });
});
