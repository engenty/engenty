import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { generateText } from "ai";

export interface GenerateKbArticleSummaryInput {
  content_markdown: string;
  title: string;
}

/** Draft a short lead summary from the current article title + body (edit-page action). */
export async function generateKbArticleSummary(
  input: GenerateKbArticleSummaryInput
): Promise<string> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is not configured (AI_GATEWAY_API_KEY).");
  }
  const title = input.title.trim() || "Untitled";
  const body = input.content_markdown.trim().slice(0, 24_000);
  if (!body && title === "Untitled") {
    throw new Error("Article needs a title or body to generate a summary.");
  }
  const { text } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    prompt: [
      "Write a concise lead summary for a knowledge-base article.",
      "One to two sentences; plain text only; no markdown headings or bullet lists.",
      "Capture the main topic and value for a reader scanning the page.",
      "",
      `Title: ${title}`,
      "",
      "Body:",
      "---",
      body || "(empty)",
      "---",
    ].join("\n"),
  });
  const summary = text.trim();
  if (!summary) {
    throw new Error("Summary generation returned empty text.");
  }
  return summary.slice(0, 2048);
}
