import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MODEL_IMAGE_MAX_BYTES,
  MODEL_IMAGE_MAX_EDGE_PX,
  prepareModelNativeImage,
} from "../api/attachments/prepare-model-image.js";

async function jpegBytes(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      background: { b: 40, g: 80, r: 200 },
      channels: 3,
      height,
      width,
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("prepareModelNativeImage", () => {
  it("downscales a large JPEG and keeps it under the wire budget", async () => {
    const source = await jpegBytes(4000, 3000);
    expect(source.byteLength).toBeGreaterThan(50_000);

    const prepared = await prepareModelNativeImage(source);
    expect(prepared).not.toBeNull();
    expect(prepared?.mediaType).toBe("image/jpeg");
    expect(prepared?.data.startsWith("data:image/jpeg;base64,")).toBe(true);

    const payload = prepared?.data.split(",")[1] ?? "";
    const decoded = Buffer.from(payload, "base64");
    expect(decoded.byteLength).toBeLessThanOrEqual(MODEL_IMAGE_MAX_BYTES);
    expect(decoded.byteLength).toBeLessThan(source.byteLength);

    const info = await sharp(decoded).metadata();
    expect(Math.max(info.width ?? 0, info.height ?? 0)).toBeLessThanOrEqual(
      MODEL_IMAGE_MAX_EDGE_PX
    );
  });

  it("returns null for non-image bytes", async () => {
    const prepared = await prepareModelNativeImage(Buffer.from("not an image"));
    expect(prepared).toBeNull();
  });
});
