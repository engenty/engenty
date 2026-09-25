import {
  type AgentEngentyKind,
  buildAgentLookImagePrompt,
  buildAgentLookSvgPrompt,
  generateImageBytes,
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
  resolvePlatformImageModelId,
} from "@engenty/ai-core";
import { generateText } from "ai";
import sharp from "sharp";
import { resolveLanguageModel } from "../../src/model-gateways/resolve-language-model.js";

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

export async function generateAgentLookPng(
  input: AgentLookGenerateInput
): Promise<GeneratedLookPng> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("not_configured");
  }
  const prompt = buildAgentLookImagePrompt(input);
  const modelId = resolvePlatformImageModelId();
  const bytes = await generateImageBytes({
    aspectRatio: "1:1",
    modelId,
    prompt,
  });
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
    model: resolveLanguageModel(resolveChatModelId({ purpose: "fast_text" })),
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
