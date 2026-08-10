import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { generateText, Output } from "ai";
import { z } from "zod";
import type {
  KbArticleTemplate,
  KbTemplatePropertyDefinition,
} from "../schema/types.js";

const metadataValueSchema = z.union([z.string(), z.number(), z.null()]);

/** OpenAI structured output rejects `z.record` (`propertyNames` in JSON Schema). */
export function buildRefreshOutputSchema(template: KbArticleTemplate | null) {
  const propertyFields: Record<string, typeof metadataValueSchema> = {};
  for (const def of template?.property_definitions ?? []) {
    propertyFields[def.key] = metadataValueSchema;
  }
  return z.object({
    title: z.string().min(1).max(512),
    summary: z.string().max(2048).nullable(),
    properties: z.object(propertyFields),
  });
}

export function describeTemplateProperties(
  template: KbArticleTemplate | null
): string {
  if (!template || template.property_definitions.length === 0) {
    return "No template properties are defined.";
  }
  return template.property_definitions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((def) => {
      const options =
        def.type === "select" && def.options?.length
          ? ` Options: ${def.options.join(", ")}.`
          : "";
      return `- ${def.key} (${def.type}): ${def.label}. ${def.description}${options}`;
    })
    .join("\n");
}

export function normalizeExtractedProperties(
  template: KbArticleTemplate | null,
  raw: Record<string, string | number | null>
): Record<string, string | number | null> {
  if (!template) {
    return {};
  }
  const defsByKey = new Map<string, KbTemplatePropertyDefinition>(
    template.property_definitions.map((def) => [def.key, def])
  );
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    const def = defsByKey.get(key);
    if (!def) {
      continue;
    }
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (def.type === "number") {
      const n = typeof value === "number" ? value : Number.parseFloat(value);
      out[key] = Number.isFinite(n) ? n : null;
      continue;
    }
    out[key] = String(value).trim() || null;
  }
  return out;
}

function formatPropertyValue(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  return String(value).trim();
}

/** Replace `[property-key]` tokens using extracted template property values. */
export function substituteTemplatePropertyPlaceholders(
  templateMarkdown: string,
  properties: Record<string, string | number | null>,
  definitions: KbTemplatePropertyDefinition[]
): string {
  let result = templateMarkdown;
  for (const def of definitions) {
    const value = formatPropertyValue(properties[def.key] ?? null);
    if (!value) {
      continue;
    }
    const keyPattern = new RegExp(`\\[${escapeRegExp(def.key)}\\]`, "gi");
    result = result.replace(keyPattern, value);
    const labelSlug = def.label
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    if (labelSlug && labelSlug !== def.key) {
      const labelPattern = new RegExp(`\\[${escapeRegExp(labelSlug)}\\]`, "gi");
      result = result.replace(labelPattern, value);
    }
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface KbTemplateExtractedMetadata {
  custom_properties: Record<string, string | number | null>;
  summary: string | null;
  title: string;
}

export async function extractKbTemplateMetadataFromSource(input: {
  contentMarkdown: string;
  sourceTitle?: string;
  sourceUrl?: string | null;
  template: KbArticleTemplate | null;
}): Promise<KbTemplateExtractedMetadata> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is required to extract template metadata.");
  }
  const template = input.template;
  const refreshOutputSchema = buildRefreshOutputSchema(template);
  const { output } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    output: Output.object({ schema: refreshOutputSchema }),
    prompt: [
      "Extract clean article metadata from the source content.",
      "Return a concise title, a one to two sentence summary, and values only for the listed template property keys.",
      "Use null when a property is not present in the content. Do not invent values.",
      input.sourceTitle ? `Suggested title: ${input.sourceTitle}` : "",
      input.sourceUrl ? `Source URL: ${input.sourceUrl}` : "",
      "",
      "Template properties:",
      describeTemplateProperties(template),
      "",
      "Source content:",
      "---",
      [
        input.sourceTitle ? `Title: ${input.sourceTitle}` : "",
        input.contentMarkdown,
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 24_000),
      "---",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return {
    title: output.title.trim(),
    summary: output.summary?.trim() || null,
    custom_properties: normalizeExtractedProperties(
      template,
      output.properties
    ),
  };
}
