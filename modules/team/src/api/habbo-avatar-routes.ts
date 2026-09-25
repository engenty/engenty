/**
 * Team Habbo avatar generation on the platform `image` model role.
 */

import {
  generateImageBytes,
  ImageModelGatewayError,
  type ImageReference,
  ModelRoleNotBoundError,
  readAiGatewayApiKeyFromEnv,
  resolvePlatformImageModelId,
} from "@engenty/ai-core";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { z } from "@hono/zod-openapi";
import {
  buildHabboAvatarPrompt,
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

function bad(msg: string, status = 400, code = "bad_request") {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message: msg } }),
    {
      status,
      headers: { "content-type": "application/json" },
    }
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

const REFERENCE_HINT =
  "Use the attached photo only as a loose likeness hint for hair/skin (still Habbo pixel art — never photoreal).";

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
    summary: "Generate Habbo-style pixel avatars (image model role)",
    tags: ["team"],
    request: { body: bodySchema },
    responses: {
      200: { description: "Generated avatar PNG data URLs" },
    },
    handler: async (ctx) => {
      if (!readAiGatewayApiKeyFromEnv()) {
        return bad(
          "AI Gateway is not configured (AI_GATEWAY_API_KEY).",
          503,
          "not_configured"
        );
      }

      // Framework already parses OpenAPI `request.body` into `ctx.body`.
      // Re-reading `ctx.request.json()` yields {} after the stream is consumed,
      // which dropped reference photos and variation_count.
      const body = bodySchema.parse(ctx.body ?? {});
      const baseOptions: HabboAvatarGenOptions = body.options ?? {};
      const count = body.variation_count ?? 3;
      const variations = HABBO_AVATAR_VARIATIONS.slice(0, count);
      let reference: ImageReference | null = null;
      if (body.reference_data_url?.trim()) {
        reference = parseDataUrl(body.reference_data_url);
        if (!reference) {
          return bad("reference_data_url must be a data:image/...;base64 URL");
        }
        if (!reference.mediaType.startsWith("image/")) {
          return bad("reference_data_url must be an image");
        }
      }

      let modelId: string;
      try {
        modelId = resolvePlatformImageModelId();
      } catch (err) {
        if (
          !(
            err instanceof ImageModelGatewayError ||
            err instanceof ModelRoleNotBoundError
          )
        ) {
          throw err;
        }
        return bad(err.message, 503, "not_configured");
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
            const bytes = await generateImageBytes({
              aspectRatio: "1:1",
              modelId,
              prompt: reference ? `${prompt}\n${REFERENCE_HINT}` : prompt,
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
        return bad(msg, 502, "generation_failed");
      }

      return {
        ok: true as const,
        model: modelId,
        avatars,
      };
    },
  });
}
