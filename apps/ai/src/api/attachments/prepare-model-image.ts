/**
 * Shrink a chat-attachment image so it can travel as a multimodal file part.
 *
 * Phone JPEGs are often 4–12 MB. Mastra inlines them as base64 on the Gateway
 * request (~33% larger on the wire). Providers drop or reject those parts, so
 * the model only sees the caption and the turn looks like a failed vision
 * call. Transcript storage still keeps the original bytes.
 */
import { createRequire } from "node:module";
import type Sharp from "sharp";

const require = createRequire(import.meta.url);
const sharp = require("sharp") as typeof Sharp;

/** Long-edge cap used by Claude / GLM vision; OpenAI high-res is 2048. */
export const MODEL_IMAGE_MAX_EDGE_PX = 1568;

/**
 * Max encoded bytes after resize. Leaves room for the rest of the chat JSON
 * under typical 4.5–10 MB provider body limits.
 */
export const MODEL_IMAGE_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);

const JPEG_QUALITY_STEPS = [80, 70, 55, 40] as const;

export interface PreparedModelImage {
  data: string;
  mediaType: "image/jpeg";
}

function toDataUrl(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Decode, auto-orient, downscale, and JPEG-compress. Returns null when the
 * bytes are not an image sharp can read — caller should skip model_native.
 */
export async function prepareModelNativeImage(
  bytes: Uint8Array
): Promise<PreparedModelImage | null> {
  try {
    const pipeline = sharp(bytes, { animated: false, failOn: "none" })
      .rotate()
      .resize({
        fit: "inside",
        height: MODEL_IMAGE_MAX_EDGE_PX,
        width: MODEL_IMAGE_MAX_EDGE_PX,
        withoutEnlargement: true,
      });

    for (const quality of JPEG_QUALITY_STEPS) {
      const encoded = await pipeline
        .clone()
        .jpeg({ mozjpeg: true, quality })
        .toBuffer();
      if (encoded.byteLength <= MODEL_IMAGE_MAX_BYTES) {
        return { data: toDataUrl(encoded), mediaType: "image/jpeg" };
      }
    }
    return null;
  } catch {
    return null;
  }
}
