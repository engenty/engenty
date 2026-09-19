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

// One flat object, not a discriminated union: OpenAI-family providers refuse
// a function whose parameters are a top-level `anyOf` ("schema must be a
// JSON Schema of type object, got None") — a hired engenty carries this tool
// on every turn, so that refusal took whole resumes down. The per-action
// requirements live in the refinement below instead of in branch shapes.
const inputSchema = z
  .object({
    action: z
      .enum(["catalog", "suggest", "generate", "wear"])
      .describe(
        "`catalog` lists the blobs; `suggest` needs `job`; `generate` needs `brief`; `wear` needs `summary` plus what to wear."
      ),
    brief: z
      .string()
      .max(1000)
      .optional()
      .describe(
        "generate: what to draw, in the person's words. Agree the brief in chat first."
      ),
    clear_avatar: z
      .boolean()
      .optional()
      .describe("wear: drop a generated portrait and go back to the blob."),
    color: z
      .string()
      .max(40)
      .optional()
      .describe(
        "generate: color name or hex if they asked for one off the blob palette."
      ),
    description: z
      .string()
      .max(500)
      .optional()
      .describe(
        "suggest: mandate summary to match a look to, if you already have one. wear: the new mandate summary (10+ chars)."
      ),
    engenty: kindSchema.optional().describe("wear: the blob to put on."),
    format: z
      .enum(["png", "svg"])
      .default("png")
      .describe("generate: png (default) or svg."),
    job: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "suggest: what this Engenty is for — job, tone, who it talks to."
      ),
    kind: kindSchema
      .optional()
      .describe(
        "generate: start from this blob silhouette when they picked one."
      ),
    name: z.string().max(80).optional().describe("suggest / wear: a name."),
    preview_id: z
      .string()
      .uuid()
      .optional()
      .describe("wear: id returned by a generate call in this conversation."),
    summary: z
      .string()
      .max(200)
      .optional()
      .describe(
        "wear: one line for the person approving — what changes and why."
      ),
  })
  .superRefine((value, ctx) => {
    if (value.action === "suggest" && (value.job ?? "").trim().length < 3) {
      ctx.addIssue({
        code: "custom",
        message: "suggest needs `job` (3+ chars).",
        path: ["job"],
      });
    }
    if (value.action === "generate" && (value.brief ?? "").trim().length < 3) {
      ctx.addIssue({
        code: "custom",
        message: "generate needs `brief` (3+ chars).",
        path: ["brief"],
      });
    }
    if (value.action === "wear") {
      if (!value.summary?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "wear needs `summary`.",
          path: ["summary"],
        });
      }
      if (value.description !== undefined && value.description.length < 10) {
        ctx.addIssue({
          code: "custom",
          message:
            "wear: `description` is the new mandate summary (10+ chars).",
          path: ["description"],
        });
      }
      if (
        !(
          value.engenty ||
          value.preview_id ||
          value.name ||
          value.description ||
          value.clear_avatar
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Pass a blob kind, a generate preview_id, a name, a description, or clear_avatar.",
        });
      }
    }
  });

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
          instructions: input.job ?? "",
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
        return runGenerate({
          generatePng,
          generateSvg,
          input: {
            brief: input.brief ?? "",
            color: input.color,
            format: input.format,
            kind: input.kind,
          },
        });
      }
      return wearAgentLook({
        ctx,
        request: {
          summary: input.summary ?? "",
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
  input: {
    brief: string;
    color?: string;
    format: "png" | "svg";
    kind?: z.infer<typeof kindSchema>;
  };
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
