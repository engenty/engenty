// `agent_look` — a hired Engenty designing its own face in conversation:
// pick one of the ten blobs (silhouette + color), generate a new portrait
// (PNG via Gemini Flash Image, or SVG markup rasterized to PNG), and/or
// propose a name and mandate summary that fit. Nothing sticks until a
// person approves the wear card — same gate as `agent_self_revise`.
import {
  AGENT_ENGENTY_KINDS,
  AGENT_ENGENTY_LOOKS,
  suggestAgentLook,
} from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  agentLookGenerateUnavailableMessage,
  generateAgentLookPng,
  generateAgentLookSvg,
} from "./agent-look-generate.js";
import {
  bytesToPngDataUrl,
  putAgentLookPreview,
} from "./agent-look-preview.js";
import {
  AGENT_LOOK_TOOL_ID,
  type uploadAgentLookAvatarPng,
  wearAgentLook,
} from "./agent-look-wear.js";
import { resolveEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { requestDecisionResumeSchema } from "./request-decision/native-request-decision.js";

export { AGENT_LOOK_TOOL_ID } from "./agent-look-wear.js";

const kindSchema = z.enum(AGENT_ENGENTY_KINDS);

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("catalog") }),
  z.object({
    action: z.literal("suggest"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("Mandate summary to match a look to, if you already have one."),
    job: z
      .string()
      .min(3)
      .max(2000)
      .describe("What this Engenty is for — job, tone, who it talks to."),
    name: z.string().max(80).optional(),
  }),
  z.object({
    action: z.literal("generate"),
    brief: z
      .string()
      .min(3)
      .max(1000)
      .describe(
        "What to draw, in the person's words. Agree the brief in chat first."
      ),
    color: z
      .string()
      .max(40)
      .optional()
      .describe(
        "Color name or hex if they asked for one off the blob palette."
      ),
    format: z.enum(["png", "svg"]).default("png"),
    kind: kindSchema
      .optional()
      .describe("Start from this blob silhouette when they picked one."),
  }),
  z
    .object({
      action: z.literal("wear"),
      clear_avatar: z
        .boolean()
        .optional()
        .describe("Drop a generated portrait and go back to the blob."),
      description: z.string().min(10).max(500).optional(),
      engenty: kindSchema.optional(),
      name: z.string().min(1).max(80).optional(),
      preview_id: z
        .string()
        .uuid()
        .optional()
        .describe("Id returned by a generate call in this conversation."),
      summary: z
        .string()
        .min(1)
        .max(200)
        .describe("One line for the person approving: what changes and why."),
    })
    .refine(
      (value) =>
        Boolean(
          value.engenty ||
            value.preview_id ||
            value.name ||
            value.description ||
            value.clear_avatar
        ),
      {
        message:
          "Pass a blob kind, a generate preview_id, a name, a description, or clear_avatar.",
      }
    ),
]);

export type AgentLookGenerateFn = typeof generateAgentLookPng;

export function createAgentLookTools(deps?: {
  generatePng?: AgentLookGenerateFn;
  generateSvg?: AgentLookGenerateFn;
  uploadAvatar?: typeof uploadAgentLookAvatarPng;
}) {
  const generatePng = deps?.generatePng ?? generateAgentLookPng;
  const generateSvg = deps?.generateSvg ?? generateAgentLookSvg;

  const tool = createTool({
    id: AGENT_LOOK_TOOL_ID,
    description:
      "Design YOUR OWN face and identity in this conversation. " +
      "`catalog` lists the ten existing Engenty blobs (silhouette + locked color). " +
      "`suggest` picks a fitting blob, name, and mandate summary from the job. " +
      "`generate` draws a new portrait (png via Gemini Flash Image, or svg) — " +
      "agree the brief with the person first; the preview is shown in chat. " +
      "`wear` proposes the blob and/or that preview (and optional name/description); " +
      "nothing changes until they approve the card. You cannot change a colleague.",
    inputSchema,
    resumeSchema: requestDecisionResumeSchema,
    execute: async (input, ctx) => {
      if (input.action === "catalog") {
        return {
          ok: true as const,
          looks: AGENT_ENGENTY_LOOKS,
          note: "Each kind is a silhouette with a locked color. Pick one with wear, or generate a new portrait.",
        };
      }
      if (input.action === "suggest") {
        const suggested = suggestAgentLook({
          description: input.description,
          name: input.name,
          instructions: input.job,
        });
        return {
          ok: true as const,
          description: suggested.description,
          engenty: suggested.look.kind,
          look: suggested.look,
          name: suggested.name,
          rationale: suggested.rationale,
          note: "Offer this to the person. Adjust in chat, then wear or generate.",
        };
      }
      if (input.action === "generate") {
        return runGenerate({ generatePng, generateSvg, input });
      }
      return wearAgentLook({
        ctx,
        request: {
          summary: input.summary,
          ...(input.clear_avatar ? { clear_avatar: true } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.engenty ? { engenty: input.engenty } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.preview_id ? { preview_id: input.preview_id } : {}),
        },
        ...(deps?.uploadAvatar ? { uploadAvatar: deps.uploadAvatar } : {}),
      });
    },
    toModelOutput: (output) => {
      if (!output || typeof output !== "object") {
        return { type: "text" as const, value: String(output) };
      }
      const record = output as Record<string, unknown>;
      const { data_url: _dataUrl, svg: _svg, _meta, ...rest } = record;
      return { type: "text" as const, value: JSON.stringify(rest) };
    },
  });

  return { [AGENT_LOOK_TOOL_ID]: tool };
}

async function runGenerate(input: {
  generatePng: AgentLookGenerateFn;
  generateSvg: AgentLookGenerateFn;
  input: Extract<z.infer<typeof inputSchema>, { action: "generate" }>;
}) {
  const run = resolveEngentyToolsRunContext();
  const agentId = run.agentTypeKey?.trim();
  const tenantId = run.tenantId?.trim();
  if (!(agentId && tenantId)) {
    return {
      ok: false as const,
      code: "unknown_agent",
      message:
        "This run does not know which registry agent it is, so it cannot generate a look.",
    };
  }
  const name = agentId;
  try {
    const generated =
      input.input.format === "svg"
        ? await input.generateSvg({
            brief: input.input.brief,
            color: input.input.color,
            kind: input.input.kind,
            name,
          })
        : await input.generatePng({
            brief: input.input.brief,
            color: input.input.color,
            kind: input.input.kind,
            name,
          });
    const previewId = putAgentLookPreview({
      agentId,
      bytes: generated.bytes,
      contentType: "image/png",
      createdAt: Date.now(),
      format: generated.format,
      tenantId,
      ...(generated.svg ? { svg: generated.svg } : {}),
    });
    const dataUrl = bytesToPngDataUrl(generated.bytes);
    return {
      ok: true as const,
      format: generated.format,
      preview_id: previewId,
      data_url: dataUrl,
      note: "Show this portrait to the person. If they like it, wear with this preview_id. Do not claim it is their face until wear is approved.",
      _meta: {
        engenty: {
          avatar_preview: {
            data_url: dataUrl,
            format: generated.format,
            preview_id: previewId,
          },
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "not_configured") {
      return {
        ok: false as const,
        code: "not_configured",
        message: agentLookGenerateUnavailableMessage(),
      };
    }
    return {
      ok: false as const,
      code: "generate_failed",
      message: `Could not generate a portrait (${message}). Offer a blob from catalog instead.`,
    };
  }
}

export const agentLookTool = createAgentLookTools()[AGENT_LOOK_TOOL_ID];
