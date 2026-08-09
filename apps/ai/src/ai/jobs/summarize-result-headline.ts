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

/**
 * Why the run is asking for approval, in one line — so the approval card says
 * "Send the signed offer to Acme" instead of only naming the raw operation id.
 * Present tense, because the action has NOT happened yet.
 */
const APPROVAL_SYSTEM_PROMPT = [
  "An AI agent paused a task because it needs a human to approve an action.",
  "Write a single present-tense line stating what it wants to do and why,",
  "based on its notes and the operation it is gated on.",
  "Rules:",
  "- Describe the concrete action and its subject, not that approval is needed.",
  "- Max 16 words. No operation ids, no quotes, no trailing period.",
  "- Plain language, same language as the notes.",
].join(" ");

export async function summarizeTaskResultHeadline(
  params: SummarizeTaskResultHeadlineParams
): Promise<string | null> {
  return await generateHeadline({
    ...params,
    prompt: params.resultText,
    instructions: SYSTEM_PROMPT,
  });
}

export interface SummarizeApprovalRequestParams {
  /** AI Gateway model id; defaults to the cheap classifier model. */
  modelId?: string;
  /** Human labels (or ids) of the gated operations the run is waiting on. */
  operations: string[];
  /** The agent's notes up to the point it paused. May be empty. */
  resultText: string;
  /** Task identifier, for logging only. */
  taskRef: string;
}

export async function summarizeApprovalRequest(
  params: SummarizeApprovalRequestParams
): Promise<string | null> {
  const operations = params.operations.filter((op) => op.trim().length > 0);
  const notes = params.resultText.trim();
  if (operations.length === 0 && notes.length === 0) {
    return null;
  }
  return await generateHeadline({
    ...(params.modelId ? { modelId: params.modelId } : {}),
    prompt: [
      `Gated operations: ${operations.join(", ") || "unknown"}`,
      notes ? `Agent notes:\n${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    instructions: APPROVAL_SYSTEM_PROMPT,
    taskRef: params.taskRef,
  });
}

async function generateHeadline(params: {
  instructions: string;
  modelId?: string;
  prompt: string;
  taskRef: string;
}): Promise<string | null> {
  const trimmed = params.prompt.trim();
  if (trimmed.length === 0 || !process.env.AI_GATEWAY_API_KEY?.trim()) {
    return null;
  }
  const model = params.modelId?.trim() || DEFAULT_AI_CLASSIFIER_MODEL_ID;
  try {
    const { text } = await generateText({
      maxOutputTokens: 40,
      model,
      prompt: trimmed.slice(0, MAX_INPUT_CHARS),
      instructions: params.instructions,
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
