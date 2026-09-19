import {
  type AgentEngentyKind,
  buildAgentLookImagePrompt,
  buildAgentLookSvgPrompt,
  DEFAULT_AGENT_LOOK_IMAGE_MODEL,
  DEFAULT_AGENT_LOOK_SVG_MODEL,
  readAiGatewayApiKeyFromEnv,
} from "@engenty/ai-core";
import { generateImage, generateText } from "ai";
import sharp from "sharp";

export interface AgentLookGenerateInput {
  brief: string;
  color?: string | null;
  kind?: AgentEngentyKind | null;
  name?: string | null;
}

export interface GeneratedLookPng {
  bytes: Uint8Array;
  format: "png" | "svg";
  prompt: string;
  svg?: string;
}

function imageModelId(): string {
  return (
    process.env.AI_GATEWAY_IMAGE_MODEL?.trim() || DEFAULT_AGENT_LOOK_IMAGE_MODEL
  );
}

function svgModelId(): string {
  return (
    process.env.AI_GATEWAY_SVG_MODEL?.trim() || DEFAULT_AGENT_LOOK_SVG_MODEL
  );
}

export function extractSvgDocument(text: string): string | null {
  const match = text.match(/<svg\b[\s\S]*<\/svg>/i);
  return match?.[0]?.trim() ?? null;
}

export function sanitizeSvgMarkup(svg: string): string | null {
  if (svg.length > 80_000) {
    return null;
  }
  const lowered = svg.toLowerCase();
  if (
    lowered.includes("<script") ||
    lowered.includes("foreignobject") ||
    lowered.includes("javascript:") ||
    lowered.includes("<iframe") ||
    lowered.includes("<object") ||
    lowered.includes("<embed") ||
    /on[a-z]+\s*=/.test(lowered)
  ) {
    return null;
  }
  if (!(/^<svg\b/i.test(svg) && /<\/svg>\s*$/i.test(svg))) {
    return null;
  }
  return svg;
}

export async function rasterizeSvgToPng(svg: string): Promise<Uint8Array> {
  const bytes = await sharp(Buffer.from(svg, "utf8"))
    .resize(512, 512)
    .png()
    .toBuffer();
  return new Uint8Array(bytes);
}

async function generatePngFromImageModel(prompt: string): Promise<Uint8Array> {
  const modelId = imageModelId();
  if (modelId.includes("gemini") && modelId.includes("image")) {
    const result = await generateText({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
    });
    const file = result.files?.find((entry) =>
      (entry.mediaType ?? "").startsWith("image/")
    );
    if (file?.uint8Array && file.uint8Array.byteLength > 0) {
      return file.uint8Array;
    }
    throw new Error("Image model returned no image file");
  }
  const result = await generateImage({
    aspectRatio: "1:1",
    model: modelId,
    n: 1,
    prompt,
  });
  const img = result.image ?? result.images?.[0];
  if (img?.uint8Array && img.uint8Array.byteLength > 0) {
    return img.uint8Array;
  }
  if (img?.base64) {
    return Uint8Array.from(Buffer.from(img.base64, "base64"));
  }
  throw new Error("Image model returned no image bytes");
}

export async function generateAgentLookPng(
  input: AgentLookGenerateInput
): Promise<GeneratedLookPng> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("not_configured");
  }
  const prompt = buildAgentLookImagePrompt(input);
  const bytes = await generatePngFromImageModel(prompt);
  return { bytes, format: "png", prompt };
}

export async function generateAgentLookSvg(
  input: AgentLookGenerateInput
): Promise<GeneratedLookPng> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("not_configured");
  }
  const prompt = buildAgentLookSvgPrompt(input);
  const result = await generateText({
    model: svgModelId(),
    prompt,
  });
  const extracted = extractSvgDocument(result.text ?? "");
  const svg = extracted ? sanitizeSvgMarkup(extracted) : null;
  if (!svg) {
    throw new Error("svg_invalid");
  }
  const bytes = await rasterizeSvgToPng(svg);
  return { bytes, format: "svg", prompt, svg };
}

export function agentLookGenerateUnavailableMessage(): string {
  return (
    "Image generation is not configured (AI_GATEWAY_API_KEY). " +
    "You can still pick an existing blob with action catalog / wear."
  );
}
