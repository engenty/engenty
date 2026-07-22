// A one-line, human-readable headline for the inbox: "what the agent actually
// did", generated from its result note by a cheap model — so a completed-task
// notification reads "Drafted the Q3 onboarding email sequence" instead of the
// interchangeable "Task ENG-109 completed and is ready for review".
//
// Best-effort: returns null on missing gateway key, empty input, or any LLM
// failure, so callers keep their generic summary.
import { DEFAULT_AI_CLASSIFIER_MODEL_ID } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";

const logger = createLogger({ name: "apps/ai/task-headline" });

const MAX_INPUT_CHARS = 4000;
const MAX_HEADLINE_CHARS = 120;

const SYSTEM_PROMPT = [
  "You write a single past-tense headline summarizing what an AI agent",
  "accomplished, based on its result note.",
  "Rules:",
  "- Describe the concrete outcome, not that a task finished.",
  "- Max 12 words. No task IDs, no quotes, no trailing period.",
  "- Plain language, same language as the note.",
].join(" ");

export interface SummarizeTaskResultHeadlineParams {
  /** AI Gateway model id; defaults to the cheap classifier model. */
  modelId?: string;
  resultText: string;
  /** Task identifier, for logging only. */
  taskRef: string;
}

export async function summarizeTaskResultHeadline(
  params: SummarizeTaskResultHeadlineParams
): Promise<string | null> {
  const trimmed = params.resultText.trim();
  if (trimmed.length === 0 || !process.env.AI_GATEWAY_API_KEY?.trim()) {
    return null;
  }
  const model = params.modelId?.trim() || DEFAULT_AI_CLASSIFIER_MODEL_ID;
  try {
    const { text } = await generateText({
      maxOutputTokens: 40,
      model,
      prompt: trimmed.slice(0, MAX_INPUT_CHARS),
      system: SYSTEM_PROMPT,
      temperature: 0.2,
    });
    const headline = text
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\.+$/, "")
      .trim();
    return headline.length > 0 ? headline.slice(0, MAX_HEADLINE_CHARS) : null;
  } catch (error) {
    logger.warn("Task headline summarization failed", {
      error: error instanceof Error ? error.message : String(error),
      model,
      task_ref: params.taskRef,
    });
    return null;
  }
}
