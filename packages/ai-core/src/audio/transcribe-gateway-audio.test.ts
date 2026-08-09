import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TranscribeGatewayAudioError,
  transcribeGatewayAudio,
} from "./transcribe-gateway-audio.js";

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
    await expect(
      transcribeGatewayAudio(new Uint8Array([1, 2, 3]))
    ).resolves.toEqual({ text: "hello" });
  });

  it("wraps transcription failures", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const { transcribe } = await import("ai");
    vi.mocked(transcribe).mockRejectedValueOnce(new Error("gateway down"));

    await expect(
      transcribeGatewayAudio(new Uint8Array([1, 2, 3]))
    ).rejects.toBeInstanceOf(TranscribeGatewayAudioError);
  });
});
