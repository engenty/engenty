import { describe, expect, it } from "vitest";
import {
  gatewayFileDataMiddleware,
  normalizeGatewayFilePart,
} from "../gateway-file-data-middleware.js";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString("base64");
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function filePart(data: unknown, extra: Record<string, unknown> = {}) {
  return { type: "file", mediaType: "image/png", data, ...extra };
}

describe("normalizeGatewayFilePart", () => {
  it("tags a data-URL string as inline base64 (not a url fileUri)", () => {
    expect(normalizeGatewayFilePart(filePart(PNG_DATA_URL))).toEqual({
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    });
  });

  it("tags a bare base64 string", () => {
    expect(normalizeGatewayFilePart(filePart(PNG_BASE64))).toEqual({
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    });
  });

  it("rewrites Uint8Array bytes to a base64 data tag", () => {
    expect(normalizeGatewayFilePart(filePart(PNG_BYTES))).toEqual({
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    });
  });

  it("rewrites Mastra's tagged Uint8Array ({ type: data, data: bytes })", () => {
    expect(
      normalizeGatewayFilePart(filePart({ type: "data", data: PNG_BYTES }))
    ).toEqual({
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    });
  });

  it("rewrites a tagged data: URL ({ type: url }) so Vertex does not get a fileUri", () => {
    expect(
      normalizeGatewayFilePart(filePart({ type: "url", url: PNG_DATA_URL }))
    ).toEqual({
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    });
  });

  it("rewrites a URL object whose protocol is data:", () => {
    expect(normalizeGatewayFilePart(filePart(new URL(PNG_DATA_URL)))).toEqual({
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    });
  });

  it("leaves https file URLs as url tags", () => {
    const https = "https://cdn.example/shot.png";
    expect(normalizeGatewayFilePart(filePart(https))).toEqual({
      type: "file",
      mediaType: "image/png",
      data: { type: "url", url: https },
    });
    expect(
      normalizeGatewayFilePart(filePart({ type: "url", url: https }))
    ).toEqual(filePart({ type: "url", url: https }));
  });

  it("is idempotent for an already-correct base64 data tag", () => {
    const tagged = filePart({ type: "data", data: PNG_BASE64 });
    expect(normalizeGatewayFilePart(tagged)).toEqual(tagged);
  });

  it("leaves non-file parts untouched", () => {
    const text = { type: "text", text: "look" };
    expect(normalizeGatewayFilePart(text)).toBe(text);
  });
});

describe("gatewayFileDataMiddleware", () => {
  it("rewrites file parts on the prompt before the gateway call", async () => {
    const transform = gatewayFileDataMiddleware.transformParams;
    if (!transform) {
      throw new Error("expected transformParams");
    }
    const result = await transform({
      model: {} as never,
      params: {
        prompt: [
          {
            role: "user",
            content: [
              { type: "text", text: "what is this?" },
              filePart({ type: "data", data: PNG_BYTES }),
            ],
          },
        ],
      } as never,
      type: "stream",
    });
    const content = (result.prompt as Array<{ content: unknown[] }>)[0]
      ?.content;
    expect(content).toEqual([
      { type: "text", text: "what is this?" },
      {
        type: "file",
        mediaType: "image/png",
        data: { type: "data", data: PNG_BASE64 },
      },
    ]);
  });
});
