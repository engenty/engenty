/**
 * convert_image — fetch a remote image and re-encode it to a different format.
 *
 * Uses sharp (libvips) for conversion. Accepts any format sharp can read
 * (JPEG, PNG, WebP, AVIF, TIFF, GIF, SVG) and outputs JPEG, PNG, WebP, or AVIF.
 * Returns a data URL so the result is immediately usable by subsequent tools.
 */
import sharp from "sharp";
import { z } from "zod";

export const CONVERT_IMAGE_TOOL_ID = "convert_image" as const;

export const convertImageInputSchema = z.object({
  source_url: z
    .string()
    .url()
    .describe(
      "Public URL of the image to convert. Supports JPEG, PNG, WebP, AVIF, TIFF, GIF, SVG."
    ),
  target_format: z
    .enum(["jpeg", "png", "webp", "avif"])
    .describe("Output image format."),
  quality: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Encoding quality 1–100 for lossy formats (jpeg, webp, avif). Defaults to 85."
    ),
  max_width: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Resize so width does not exceed this value. Aspect ratio is preserved."
    ),
  max_height: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Resize so height does not exceed this value. Aspect ratio is preserved."
    ),
});

export type ConvertImageInput = z.infer<typeof convertImageInputSchema>;

export interface ConvertImageResult {
  data_url: string;
  format: string;
  height: number;
  ok: true;
  size_bytes: number;
  width: number;
}

export interface ConvertImageError {
  error: string;
  ok: false;
}

export interface ConvertImageToolDefinition {
  description: string;
  execute: (
    input: ConvertImageInput
  ) => Promise<ConvertImageResult | ConvertImageError>;
  id: typeof CONVERT_IMAGE_TOOL_ID;
  inputSchema: typeof convertImageInputSchema;
}

const DEFAULT_QUALITY = 85;
const MAX_FETCH_BYTES = 20 * 1024 * 1024; // 20 MB guard

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: HTTP ${response.status}`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_FETCH_BYTES) {
    throw new Error(
      `Image too large: ${contentLength} bytes (limit ${MAX_FETCH_BYTES})`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FETCH_BYTES) {
    throw new Error(
      `Image too large after download (limit ${MAX_FETCH_BYTES} bytes)`
    );
  }
  return Buffer.from(arrayBuffer);
}

export async function runConvertImage(
  input: ConvertImageInput
): Promise<ConvertImageResult | ConvertImageError> {
  try {
    const parsed = convertImageInputSchema.parse(input);
    const sourceBuffer = await fetchImageBuffer(parsed.source_url);

    let pipeline = sharp(sourceBuffer, { density: 150 });

    if (parsed.max_width || parsed.max_height) {
      pipeline = pipeline.resize({
        fit: "inside",
        height: parsed.max_height,
        width: parsed.max_width,
        withoutEnlargement: true,
      });
    }

    const quality = parsed.quality ?? DEFAULT_QUALITY;

    switch (parsed.target_format) {
      case "avif":
        pipeline = pipeline.avif({ quality });
        break;
      case "jpeg":
        pipeline = pipeline.jpeg({ quality });
        break;
      case "png":
        // PNG is lossless — quality maps to compression level (inverted: 100→0, 0→9)
        pipeline = pipeline.png({
          compressionLevel: Math.round((100 - quality) / 11),
        });
        break;
      case "webp":
        pipeline = pipeline.webp({ quality });
        break;
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const mimeType =
      parsed.target_format === "jpeg"
        ? "image/jpeg"
        : `image/${parsed.target_format}`;
    const dataUrl = `data:${mimeType};base64,${data.toString("base64")}`;

    return {
      data_url: dataUrl,
      format: parsed.target_format,
      height: info.height,
      ok: true,
      size_bytes: info.size,
      width: info.width,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      ok: false,
    };
  }
}

const convertImageToolDescription =
  "Download a remote image and convert it to a different format (JPEG, PNG, WebP, or AVIF). " +
  "Supports any input format sharp can read, including SVG. " +
  "Returns a data URL you can pass directly to other tools such as set_company_logo. " +
  "Use when an image is in an unsupported format or needs to be resized before further processing.";

export function buildConvertImageTool<TTool>(
  createTool: (definition: ConvertImageToolDefinition) => TTool
): TTool {
  return createTool({
    description: convertImageToolDescription,
    execute: runConvertImage,
    id: CONVERT_IMAGE_TOOL_ID,
    inputSchema: convertImageInputSchema,
  });
}
