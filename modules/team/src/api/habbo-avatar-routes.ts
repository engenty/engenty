/**
 * Team Habbo avatar generation via AI Gateway (Gemini image model).
 */

import { readAiGatewayApiKeyFromEnv } from "@engenty/ai-core";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { z } from "@hono/zod-openapi";
import { generateImage, generateText } from "ai";
import {
  buildHabboAvatarPrompt,
  DEFAULT_HABBO_IMAGE_MODEL,
  HABBO_AVATAR_VARIATIONS,
  type HabboAvatarGenOptions,
} from "../lib/habbo-avatar-prompt.js";

const logger = createLogger({ name: "team-habbo-avatar" });

const optionEnum = <T extends string>(values: readonly [T, ...T[]]) =>
  z.enum(values);

const habboOptionsSchema = z.object({
  glasses: z.boolean().optional(),
  hairColor: optionEnum([
    "dark",
    "blonde",
    "auburn",
    "silver",
    "ember",
  ] as const).optional(),
  hairStyle: optionEnum([
    "short",
    "wavy",
    "spiky",
    "bob",
    "afro",
  ] as const).optional(),
  outfitColor: optionEnum([
    "ember",
    "cobalt",
    "moss",
    "rose",
    "amber",
    "dark",
  ] as const).optional(),
  outfitStyle: optionEnum([
    "casual",
    "suit",
    "hoodie",
    "engenty",
  ] as const).optional(),
  skinTone: optionEnum(["fair", "medium", "tan", "deep"] as const).optional(),
});

const bodySchema = z.object({
  member_name: z.string().max(120).optional(),
  options: habboOptionsSchema.optional(),
  /** Optional photo data URL (data:image/...;base64,...) for likeness hints. */
  reference_data_url: z.string().max(6_000_000).optional(),
  variation_count: z.number().int().min(1).max(3).optional(),
});

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resolveImageModel(): string {
  return (
    process.env.AI_GATEWAY_IMAGE_MODEL?.trim() || DEFAULT_HABBO_IMAGE_MODEL
  );
}

function bytesToPngDataUrl(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${b64}`;
}

function parseDataUrl(dataUrl: string): {
  bytes: Uint8Array;
  mediaType: string;
} | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) {
    return null;
  }
  try {
    return {
      mediaType: m[1]!,
      bytes: Uint8Array.from(Buffer.from(m[2]!, "base64")),
    };
  } catch {
    return null;
  }
}

async function generateOneHabboPng(args: {
  modelId: string;
  prompt: string;
  reference?: { bytes: Uint8Array; mediaType: string } | null;
}): Promise<Uint8Array> {
  const { modelId, prompt, reference } = args;

  // Gemini Flash Image (and similar) via gateway: generateText returns files.
  if (modelId.includes("gemini") && modelId.includes("image")) {
    const result = await generateText({
      model: modelId,
      messages: reference
        ? [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${prompt}\nUse the attached photo only as a loose likeness hint for hair/skin (still Habbo pixel art — never photoreal).`,
                },
                {
                  type: "image",
                  image: reference.bytes,
                  mediaType: reference.mediaType,
                },
              ],
            },
          ]
        : [{ role: "user", content: prompt }],
    });
    const file = result.files?.find((f) =>
      (f.mediaType ?? "").startsWith("image/")
    );
    if (file?.uint8Array && file.uint8Array.byteLength > 0) {
      return file.uint8Array;
    }
    throw new Error("Gemini image model returned no image file");
  }

  // Imagen / OpenAI image models via generateImage
  const promptArg =
    reference == null
      ? prompt
      : {
          images: [reference.bytes],
          text: `${prompt}\nUse the reference photo only as a loose likeness hint (still Habbo pixel art — never photoreal).`,
        };

  const result = await generateImage({
    model: modelId,
    prompt: promptArg,
    n: 1,
    aspectRatio: "1:1",
  });
  const img = result.image ?? result.images?.[0];
  if (!img) {
    throw new Error("No image generated");
  }
  if (img.uint8Array && img.uint8Array.byteLength > 0) {
    return img.uint8Array;
  }
  if (img.base64) {
    return Uint8Array.from(Buffer.from(img.base64, "base64"));
  }
  throw new Error("No image bytes in model response");
}

export function registerTeamHabboAvatarRoutes(
  server: Pick<PluginServerApi, "registerHttpRoute">
) {
  server.registerHttpRoute({
    method: "post",
    path: "/api/team/avatars/habbo",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.write"],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Generate Habbo-style pixel avatars (Gemini / AI Gateway)",
    tags: ["team"],
    request: { body: bodySchema },
    responses: {
      200: { description: "Generated avatar PNG data URLs" },
    },
    handler: async (ctx) => {
      if (!readAiGatewayApiKeyFromEnv()) {
        return bad("AI Gateway is not configured (AI_GATEWAY_API_KEY).", 503);
      }

      const body = bodySchema.parse(await ctx.request.json().catch(() => ({})));
      const baseOptions: HabboAvatarGenOptions = body.options ?? {};
      const count = body.variation_count ?? 3;
      const variations = HABBO_AVATAR_VARIATIONS.slice(0, count);
      const modelId = resolveImageModel();

      let reference: { bytes: Uint8Array; mediaType: string } | null = null;
      if (body.reference_data_url?.trim()) {
        reference = parseDataUrl(body.reference_data_url);
        if (!reference) {
          return bad("reference_data_url must be a data:image/...;base64 URL");
        }
        if (!reference.mediaType.startsWith("image/")) {
          return bad("reference_data_url must be an image");
        }
      }

      const avatars: Array<{
        id: number;
        label: string;
        data_url: string;
        options: HabboAvatarGenOptions;
      }> = [];

      try {
        const generated = await Promise.all(
          variations.map(async (v) => {
            const options: HabboAvatarGenOptions = {
              ...baseOptions,
              ...v.patch,
            };
            const prompt = buildHabboAvatarPrompt(options, {
              memberName: body.member_name,
              variationHint: v.hint,
            });
            const bytes = await generateOneHabboPng({
              modelId,
              prompt,
              reference,
            });
            return {
              id: v.id,
              label: v.label,
              data_url: bytesToPngDataUrl(bytes),
              options,
            };
          })
        );
        avatars.push(...generated);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Habbo avatar generation failed", { modelId, error: msg });
        return bad(msg, 502);
      }

      return {
        ok: true as const,
        model: modelId,
        avatars,
      };
    },
  });
}
