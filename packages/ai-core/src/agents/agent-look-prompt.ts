import type { AgentEngentyKind } from "./agent-engenty.js";
import { agentEngentyLook } from "./agent-look.js";

export function buildAgentLookImagePrompt(input: {
  brief: string;
  color?: string | null;
  kind?: AgentEngentyKind | null;
  name?: string | null;
}): string {
  const look = input.kind ? agentEngentyLook(input.kind) : undefined;
  const color = input.color?.trim() || look?.color || "a single brand color";
  const silhouette = look
    ? `${look.silhouette} blob (${look.kind})`
    : "soft rounded blob";
  const nameBit = input.name?.trim()
    ? ` Personality inspired by "${input.name.trim()}" — do not render any text or name.`
    : "";

  return [
    "Single mascot avatar, 1:1, character only, centered.",
    "An Engenty: a friendly blob creature, NOT a human, NOT a robot, NOT an animal mascot with limbs.",
    `Silhouette: ${silhouette}. Two simple cartoon eyes with white sclera and dark pupils, tiny glint, no mouth or a very small one.`,
    "Flat vector illustration, thick clean silhouette, solid fills, minimal inner shading, no gradients that look photoreal, no 3D render, no pixel art, no Habbo, no isometric hotel avatar.",
    `Body color: ${color}. One body color plus slightly darker shading. White eyes.`,
    "Background: solid pure white (#FFFFFF), no floor, no shadow, no props, no text, no watermark, no border.",
    `Brief from the person: ${input.brief.trim()}${nameBit}`,
  ].join(" ");
}

export function buildAgentLookSvgPrompt(input: {
  brief: string;
  color?: string | null;
  kind?: AgentEngentyKind | null;
  name?: string | null;
}): string {
  const look = input.kind ? agentEngentyLook(input.kind) : undefined;
  const color = input.color?.trim() || look?.color || "cobalt blue";
  const silhouette = look ? look.silhouette : "soft rounded blob";

  return [
    "Return ONLY one SVG document, no markdown, no explanation.",
    'Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">.',
    "An Engenty blob mascot: one filled organic silhouette path, two white eye ellipses with dark pupils, optional tiny highlight circles.",
    `Silhouette: ${silhouette}. Fill: ${color} as an SVG color (hex or named). No text. No images. No foreignObject. No scripts.`,
    "White background rect is optional; prefer transparent besides the blob.",
    `Brief: ${input.brief.trim()}`,
    input.name?.trim()
      ? `Vibe of "${input.name.trim()}" — still a blob, never a face portrait.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
