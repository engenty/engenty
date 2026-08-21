import { z } from "zod";

export const requestFeedbackInputSchema = z.object({
  body: z.string().optional(),
  placeholder: z.string().optional(),
  submitLabel: z.string().optional(),
  title: z.string().min(1),
});

export type RequestFeedbackInput = z.infer<typeof requestFeedbackInputSchema>;

export interface RequestFeedbackArtifact {
  artifact_id: string;
  artifact_type: "feedback";
  body?: string;
  /** AG-UI `resume[].interruptId` (defaults to `artifact_id`). */
  interrupt_id: string;
  placeholder?: string;
  submit_label?: string;
  title: string;
}

/**
 * What the tool returns on a run with no human channel. A background task job
 * or a channel bridge has nobody to type an answer, and telling the model
 * otherwise is how a run ends up waiting on a reply that can never arrive.
 */
export interface RequestFeedbackUnavailable {
  artifact_type: "feedback_unavailable";
  question: string;
  reason: "no_human_channel";
}

export const NO_HUMAN_CHANNEL_FEEDBACK_MESSAGE =
  "This run has no human channel: nothing was shown to anyone and nobody can answer. Do NOT wait for a reply. Decide from what you already have, or stop and state exactly what you needed to ask.";

export interface RequestFeedbackToolDefinition {
  description: string;
  execute: (
    input: RequestFeedbackInput
  ) => Promise<RequestFeedbackArtifact | RequestFeedbackUnavailable>;
  id: "requestFeedback";
  inputSchema: typeof requestFeedbackInputSchema;
  toModelOutput: (output?: unknown) => { type: "text"; value: string };
}

export function isRequestFeedbackUnavailable(
  value: unknown
): value is RequestFeedbackUnavailable {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { artifact_type?: unknown }).artifact_type ===
      "feedback_unavailable"
  );
}

export function createRequestFeedbackArtifact(
  input: RequestFeedbackInput
): RequestFeedbackArtifact {
  const artifact_id = crypto.randomUUID();
  return {
    artifact_id,
    artifact_type: "feedback",
    body: input.body,
    placeholder: input.placeholder,
    submit_label: input.submitLabel,
    interrupt_id: artifact_id,
    title: input.title,
  };
}

export const requestFeedbackToolDefinition: RequestFeedbackToolDefinition =
  buildRequestFeedbackToolDefinition();

/**
 * `hasHumanChannel` lets the host declare whether this run can actually be
 * answered. Omitted (the default) keeps the historical behaviour for callers
 * that only ever run in chat.
 */
export function buildRequestFeedbackToolDefinition(options?: {
  hasHumanChannel?: () => boolean;
}): RequestFeedbackToolDefinition {
  return {
    id: "requestFeedback",
    description:
      "Ask the user for free-form text input or general feedback in the chat. Use this instead of requestDecision when you need the user to type a response or write feedback rather than selecting from a list of fixed choices. Wait for the user's response before continuing.",
    inputSchema: requestFeedbackInputSchema,
    execute: async (input) => {
      if (options?.hasHumanChannel && !options.hasHumanChannel()) {
        return {
          artifact_type: "feedback_unavailable",
          question: input.title,
          reason: "no_human_channel",
        };
      }
      return createRequestFeedbackArtifact(input);
    },
    toModelOutput: (output?: unknown) => ({
      type: "text",
      value: isRequestFeedbackUnavailable(output)
        ? NO_HUMAN_CHANNEL_FEEDBACK_MESSAGE
        : "Feedback artifact shown to the user. Wait for the user's typed response before continuing.",
    }),
  };
}

export function buildRequestFeedbackTool<TTool>(
  createTool: (definition: RequestFeedbackToolDefinition) => TTool,
  options?: { hasHumanChannel?: () => boolean }
): TTool {
  return createTool(
    options
      ? buildRequestFeedbackToolDefinition(options)
      : requestFeedbackToolDefinition
  );
}
