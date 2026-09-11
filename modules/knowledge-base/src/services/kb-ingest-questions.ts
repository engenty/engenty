/**
 * "Questions answered" generation for ingested articles.
 *
 * Two artefacts come out of one model pass, on purpose:
 * - `questions` feeds `articles.questions_answered` (a plain string list the
 *   retrieval layer and the article header already consume), and
 * - `section` is a markdown Q&A block appended to the body, which is the only
 *   place an *answer* plus its citation link can actually render.
 *
 * Splitting them this way means citations survive without widening the
 * `questions_answered` column into a structured type that every reader,
 * snapshot and version-restore path would have to learn.
 */

import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { generateText, Output } from "ai";
import { z } from "zod";

/** One model pass reads this much source text; matches the summarizer budget. */
const QUESTION_SOURCE_BUDGET_CHARS = 24_000;
const MAX_QUESTIONS = 12;

const questionsOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        answer: z.string().min(1).max(2000),
        /** Verbatim locator from the text — a §, heading or clause. */
        citation: z.string().max(200).nullable(),
        question: z.string().min(1).max(300),
      })
    )
    .max(MAX_QUESTIONS),
});

export interface KbIngestQuestionsResult {
  /** Question texts only, for `articles.questions_answered`. */
  questions: string[];
  /** Markdown Q&A block, or "" when the model found nothing worth asking. */
  section: string;
}

export function buildQuestionsSection(
  entries: readonly {
    answer: string;
    citation: string | null;
    question: string;
  }[],
  headingLabel: string,
  sourceUrl: string | null
): string {
  if (entries.length === 0) {
    return "";
  }
  const blocks = entries.map((entry) => {
    const cite = entry.citation?.trim();
    // Link the citation back to the source when we have one; otherwise the
    // locator still tells a reader where in the document to look.
    const suffix = cite
      ? sourceUrl
        ? `\n\n  _${`[${cite}](${sourceUrl})`}_`
        : `\n\n  _${cite}_`
      : "";
    return `### ${entry.question.trim()}\n\n${entry.answer.trim()}${suffix}`;
  });
  return [`## ${headingLabel}`, ...blocks].join("\n\n");
}

export async function generateKbIngestQuestions(input: {
  contentMarkdown: string;
  headingLabel?: string;
  sourceTitle: string;
  sourceUrl: string | null;
}): Promise<KbIngestQuestionsResult> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is required to generate answered questions.");
  }
  const { output } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    output: Output.object({ schema: questionsOutputSchema }),
    prompt: [
      `Read this source document titled "${input.sourceTitle}" and list the questions it actually answers.`,
      "",
      `Rules:
- At most ${MAX_QUESTIONS} questions, fewer if the document is short.
- Only questions the text answers. Never invent facts or fill gaps from prior knowledge.
- Answer each one in one to three sentences, in the language of the source document.
- Set "citation" to the verbatim locator the answer comes from (a paragraph number, section symbol or heading), or null when the document has no such marker.`,
      "",
      "---",
      "",
      input.contentMarkdown.slice(0, QUESTION_SOURCE_BUDGET_CHARS),
    ].join("\n"),
  });
  const entries = output.questions;
  return {
    questions: entries.map((entry) => entry.question.trim()).filter(Boolean),
    section: buildQuestionsSection(
      entries,
      input.headingLabel ?? "Questions answered",
      input.sourceUrl
    ),
  };
}
