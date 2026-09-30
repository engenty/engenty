import { z } from "zod";

// The tool itself lives in apps/ai (native-request-feedback.ts): it SUSPENDS the
// run, which needs the Mastra run context. What stays here is the contract both
// ends share — the question the model asks and the card the client renders.

export const requestFeedbackInputSchema = z.object({
  body: z.string().optional(),
  placeholder: z.string().optional(),
  submitLabel: z.string().optional(),
  title: z.string().min(1),
});

export type RequestFeedbackInput = z.infer<typeof requestFeedbackInputSchema>;

/** The card a suspended `requestFeedback` parks on (its suspend payload). */
export const requestFeedbackArtifactSchema = z.object({
  artifact_id: z.string(),
  artifact_type: z.literal("feedback"),
  body: z.string().optional(),
  /** AG-UI `resume[].interruptId` (defaults to `artifact_id`). */
  interrupt_id: z.string(),
  placeholder: z.string().optional(),
  submit_label: z.string().optional(),
  title: z.string(),
});

export type RequestFeedbackArtifact = z.infer<
  typeof requestFeedbackArtifactSchema
>;

/**
 * What the tool returns on a run with no human channel. A background task job
 * or a channel bridge has nobody to type an answer, and telling the model
 * otherwise is how a run ends up waiting on a reply that can never arrive.
 */
export interface RequestFeedbackUnavailable {
  artifact_type: "feedback_unavailable";
  note: string;
  question: string;
  reason: "no_human_channel";
}

export const NO_HUMAN_CHANNEL_FEEDBACK_MESSAGE =
  "This run has no human channel: nothing was shown to anyone and nobody can answer. Do NOT wait for a reply. Decide from what you already have, or stop and state exactly what you needed to ask.";

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
