import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateImage, generateText } = vi.hoisted(() => ({
  generateImage: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateImage,
  generateText,
}));

import { bindingsFromList } from "../../config/model-roles.js";
import { setPlatformBindings } from "../../config/platform-bindings-snapshot.js";
import {
  generateImageBytes,
  ImageModelGatewayError,
  resolvePlatformImageModelId,
} from "../image-generation.js";

function bindImage(gateway: string, modelId: string) {
  setPlatformBindings(bindingsFromList([{ gateway, modelId, role: "image" }]));
}

describe("resolvePlatformImageModelId", () => {
  afterEach(() => setPlatformBindings(undefined));

  it("returns the model the image role is bound to", () => {
    bindImage("vercel", "openai/gpt-image-1");
    expect(resolvePlatformImageModelId()).toBe("openai/gpt-image-1");
  });

  it("throws when the image role is not bound", () => {
    expect(() => resolvePlatformImageModelId()).toThrow();
  });

  it("throws naming the role and gateway when bound off the default gateway", () => {
    bindImage("openrouter", "google/gemini-img");
    let error: unknown;
    try {
      resolvePlatformImageModelId();
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ImageModelGatewayError);
    const gatewayError = error as ImageModelGatewayError;
    expect(gatewayError.gateway).toBe("openrouter");
    expect(gatewayError.message).toContain("Image generation");
    expect(gatewayError.message).toContain("openrouter:google/gemini-img");
  });
});

describe("generateImageBytes", () => {
  beforeEach(() => {
    generateImage.mockReset();
    generateText.mockReset();
  });

  it("draws Gemini image models through generateText files", async () => {
    const png = new Uint8Array([1, 2, 3]);
    generateText.mockResolvedValue({
      files: [{ mediaType: "image/png", uint8Array: png }],
    });
    const reference = { bytes: new Uint8Array([9]), mediaType: "image/jpeg" };
    const bytes = await generateImageBytes({
      modelId: "google/gemini-2.5-flash-image",
      prompt: "a blob",
      reference,
    });
    expect(bytes).toBe(png);
    expect(generateImage).not.toHaveBeenCalled();
    const call = generateText.mock.calls[0]?.[0];
    expect(call.model).toBe("google/gemini-2.5-flash-image");
    expect(call.messages[0].content[1]).toMatchObject({
      image: reference.bytes,
      mediaType: "image/jpeg",
      type: "image",
    });
  });

  it("draws dedicated image models through generateImage", async () => {
    generateImage.mockResolvedValue({ image: { base64: "AQI=" } });
    const bytes = await generateImageBytes({
      aspectRatio: "1:1",
      modelId: "openai/gpt-image-1",
      prompt: "a cover",
    });
    expect(Array.from(bytes)).toEqual([1, 2]);
    expect(generateImage).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      model: "openai/gpt-image-1",
      n: 1,
      prompt: "a cover",
    });
  });

  it("throws when the model returns no image", async () => {
    generateText.mockResolvedValue({ files: [] });
    await expect(
      generateImageBytes({
        modelId: "google/gemini-2.5-flash-image",
        prompt: "x",
      })
    ).rejects.toThrow("no image");
  });
});
