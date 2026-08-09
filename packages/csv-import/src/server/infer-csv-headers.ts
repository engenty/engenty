import { resolveChatModelId } from "@engenty/ai-core";
import { env } from "@engenty/telemetry";
import { generateText, Output } from "ai";
import { z } from "zod";

const inferredHeadersSchema = z.object({
  headers: z.array(z.string().min(1)).min(1),
});

export interface InferCsvHeadersInput {
  columnCount: number;
  domainHint?: string;
  /** Optional target field keys/labels to bias naming (e.g. contacts import). */
  fieldHints?: Array<{ key: string; label: string; description?: string }>;
  sampleRows: string[][];
}

/**
 * Lightweight LLM pass: suggest snake_case header names from sample values.
 * Returns null when the AI gateway is unavailable.
 */
export async function inferCsvHeaders(
  input: InferCsvHeadersInput
): Promise<string[] | null> {
  const aiGatewayApiKey = env("AI_GATEWAY_API_KEY");
  if (!aiGatewayApiKey) {
    return null;
  }

  const prompt = [
    "You name CSV columns. Return structured output only.",
    "Rules:",
    `- Exactly ${input.columnCount} header names (one per column, same order).`,
    "- Use short snake_case English identifiers (customer_id, company, first_name, …).",
    "- Prefer stable import-friendly names over marketing labels.",
    "- Do not invent values; only name columns from the samples.",
    input.domainHint ? `Domain hint: ${input.domainHint}` : "",
    input.fieldHints?.length
      ? `Known target fields (bias toward these keys when they fit): ${JSON.stringify(
          input.fieldHints.slice(0, 40)
        )}`
      : "",
    `Sample rows (first ${Math.min(8, input.sampleRows.length)}): ${JSON.stringify(
      input.sampleRows.slice(0, 8)
    )}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { output } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    output: Output.object({ schema: inferredHeadersSchema }),
    prompt,
    telemetry: { isEnabled: true },
  });

  if (!output || output.headers.length !== input.columnCount) {
    return null;
  }

  return output.headers.map((header, index) => {
    const cleaned = header
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned.length > 0 ? cleaned : `column_${index + 1}`;
  });
}
