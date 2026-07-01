import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { generateText } from "ai";
import type { KbArticleTemplate } from "../schema/types.js";
import {
  describeTemplateProperties,
  extractKbTemplateMetadataFromSource,
  type KbTemplateExtractedMetadata,
  substituteTemplatePropertyPlaceholders,
} from "./kb-template-property-extract.js";

export interface KbTemplateIngestFillInput {
  instructions?: string;
  sourceMarkdown: string;
  sourceTitle: string;
  sourceUrl?: string | null;
  template: KbArticleTemplate;
}

export interface KbTemplateIngestFillResult
  extends KbTemplateExtractedMetadata {
  content_markdown: string;
}

async function fillTemplateMarkdownWithLlm(input: {
  custom_properties: Record<string, string | number | null>;
  instructions?: string;
  partiallyFilledMarkdown: string;
  sourceMarkdown: string;
  sourceTitle: string;
  sourceUrl?: string | null;
  template: KbArticleTemplate;
}): Promise<string> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is required to fill template content.");
  }

  const propertyLines = Object.entries(input.custom_properties)
    .filter(([, value]) => value !== null && String(value).trim())
    .map(([key, value]) => `- ${key}: ${String(value)}`)
    .join("\n");

  const { text } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    prompt: [
      "Fill in a knowledge-base article template using the source content.",
      "Replace every remaining [placeholder] token in the template with appropriate Markdown content.",
      "Use the extracted property values when a placeholder matches a property key or label.",
      "Keep the template headings, section order, and formatting structure.",
      "Write in the same language as the source content unless the template specifies otherwise.",
      "Do not invent facts that are not supported by the source. Use an empty string for unknown placeholders.",
      "Return only the filled article body as Markdown with no preamble.",
      input.instructions?.trim()
        ? `Additional instructions: ${input.instructions.trim()}`
        : "",
      "",
      "Template properties:",
      describeTemplateProperties(input.template),
      propertyLines ? `\nExtracted property values:\n${propertyLines}` : "",
      "",
      "Template to fill:",
      "---",
      input.partiallyFilledMarkdown.slice(0, 12_000),
      "---",
      "",
      input.sourceUrl ? `Source URL: ${input.sourceUrl}` : "",
      `Source title: ${input.sourceTitle}`,
      "",
      "Source content:",
      "---",
      input.sourceMarkdown.slice(0, 24_000),
      "---",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return text.trim();
}

export async function fillKbTemplateFromSource(
  input: KbTemplateIngestFillInput
): Promise<KbTemplateIngestFillResult> {
  const metadata = await extractKbTemplateMetadataFromSource({
    contentMarkdown: input.sourceMarkdown,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    template: input.template,
  });

  const templateMarkdown = input.template.content_markdown?.trim() ?? "";
  if (!templateMarkdown) {
    return {
      ...metadata,
      content_markdown: "",
    };
  }

  const partiallyFilled = substituteTemplatePropertyPlaceholders(
    templateMarkdown,
    metadata.custom_properties,
    input.template.property_definitions
  );

  const content_markdown = await fillTemplateMarkdownWithLlm({
    custom_properties: metadata.custom_properties,
    instructions: input.instructions,
    partiallyFilledMarkdown: partiallyFilled,
    sourceMarkdown: input.sourceMarkdown,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    template: input.template,
  });

  return {
    ...metadata,
    content_markdown,
  };
}
