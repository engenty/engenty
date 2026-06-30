import { resolveChatModelId } from "@engenty/ai-core";
import { env } from "@engenty/telemetry";
import { z } from "@hono/zod-openapi";
import { generateText } from "ai";

const importFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean(),
  type: z.string(),
});

const importAiMapInputSchema = z.object({
  csvHeaders: z.array(z.string()).min(1),
  sampleRows: z.array(z.array(z.string())).default([]),
  fieldDefinitions: z.array(importFieldDefinitionSchema).min(1),
});

const importAiMapMappingSchema = z.object({
  fieldKey: z.string().min(1),
  csvColumnIndex: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).optional(),
  isTemplate: z.boolean().optional(),
  template: z.string().min(1).optional(),
});

const importAiMapOutputSchema = z.object({
  mappings: z.array(importAiMapMappingSchema),
});

export interface ImportAiMapRouteRegistrar {
  registerHttpRoute: (route: {
    handler: (ctx: {
      body?: unknown;
      request: Request;
    }) => Promise<unknown | Response>;
    method: "post";
    operation: {
      idempotent?: boolean;
      requiredCapabilities: string[];
      riskLevel: string;
    };
    path: string;
    request: { body: typeof importAiMapInputSchema };
    responses: Record<
      number,
      { description: string; schema: typeof importAiMapOutputSchema }
    >;
    summary: string;
    tags: string[];
  }) => void;
}

export interface RegisterImportAiMapRouteOptions {
  extraPromptRules?: string[];
  path: string;
  requiredCapabilities: string[];
  tags: string[];
}

export function registerImportAiMapRoute(
  api: ImportAiMapRouteRegistrar,
  options: RegisterImportAiMapRouteOptions
) {
  api.registerHttpRoute({
    method: "post",
    path: options.path,
    operation: {
      requiredCapabilities: options.requiredCapabilities,
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Suggest CSV field mappings via AI",
    tags: options.tags,
    request: { body: importAiMapInputSchema },
    responses: {
      200: {
        description: "AI mapping suggestions",
        schema: importAiMapOutputSchema,
      },
    },
    handler: async (ctx) => {
      const input = importAiMapInputSchema.parse(ctx.body ?? {});
      const normalizedCsvHeaders = input.csvHeaders.map((header, index) => {
        const next = header.trim();
        return next.length > 0 ? next : `column_${index + 1}`;
      });
      const aiGatewayApiKey = env("AI_GATEWAY_API_KEY");
      if (!aiGatewayApiKey) {
        return new Response(
          JSON.stringify({ error: "AI_GATEWAY_API_KEY not configured" }),
          { status: 503, headers: { "content-type": "application/json" } }
        );
      }

      const prompt = [
        "You are a CSV import mapping assistant. Return ONLY valid JSON, no markdown.",
        "",
        'Output: {"mappings": [ ... ]}',
        "",
        "Mapping types:",
        '1) Simple (one CSV column → one field): {"fieldKey": "full_name", "csvColumnIndex": 0, "confidence": 0.95}',
        '2) Template (combine several columns into one field): {"fieldKey": "display_name", "isTemplate": true, "template": "{{\\"First Name\\"}} {{\\"Last Name\\"}}", "confidence": 0.9}. In JSON the template string must escape inner double quotes with backslash.',
        "",
        "Rules:",
        "- fieldKey must be one of the provided target field keys.",
        "- One CSV column can map to MULTIPLE target fields: use the same csvColumnIndex in several mappings.",
        '- Template syntax: {{"HeaderName"}} for a column by header, or {{[0]}} for column index. Escape quotes in the template string for JSON.',
        '- Unnamed headers are column_1, column_2, etc. Reference in templates as {{"column_1"}} or {{[0]}}.',
        "- Only include high-confidence mappings.",
        ...(options.extraPromptRules ?? []),
        "",
        `CSV headers: ${JSON.stringify(normalizedCsvHeaders)}`,
        `Target fields: ${JSON.stringify(
          input.fieldDefinitions.map((field) => ({
            key: field.key,
            label: field.label,
            description: field.description ?? "",
            required: field.required,
          }))
        )}`,
        `Sample rows (first 8): ${JSON.stringify(input.sampleRows.slice(0, 8))}`,
      ].join("\n");

      try {
        const result = await generateText({
          model: resolveChatModelId({ purpose: "chat" }),
          prompt,
          experimental_telemetry: { isEnabled: true },
        });

        const cleaned = result.text
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/, "")
          .trim();
        const parsedJson = JSON.parse(cleaned);
        const parsed = importAiMapOutputSchema.parse(parsedJson);

        const allowedKeys = new Set(input.fieldDefinitions.map((f) => f.key));
        const maxIndex = input.csvHeaders.length - 1;
        const mappings = parsed.mappings.filter((mapping) => {
          if (!allowedKeys.has(mapping.fieldKey)) {
            return false;
          }
          if (mapping.isTemplate && mapping.template?.trim()) {
            return true;
          }
          const idx = mapping.csvColumnIndex;
          return (
            typeof idx === "number" &&
            Number.isInteger(idx) &&
            idx >= 0 &&
            idx <= maxIndex
          );
        });

        return { mappings };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "AI mapping failed";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });
}
