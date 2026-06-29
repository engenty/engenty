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

export interface RequestFeedbackToolDefinition {
  description: string;
  execute: (input: RequestFeedbackInput) => Promise<RequestFeedbackArtifact>;
  id: "requestFeedback";
  inputSchema: typeof requestFeedbackInputSchema;
  toModelOutput: () => { type: "text"; value: string };
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

export const requestFeedbackToolDefinition: RequestFeedbackToolDefinition = {
  id: "requestFeedback",
  description:
    "Ask the user for free-form text input or general feedback in the chat. Use this instead of requestDecision when you need the user to type a response or write feedback rather than selecting from a list of fixed choices. Wait for the user's response before continuing.",
  inputSchema: requestFeedbackInputSchema,
  execute: async (input) => createRequestFeedbackArtifact(input),
  toModelOutput: () => ({
    type: "text",
    value:
      "Feedback artifact shown to the user. Wait for the user's typed response before continuing.",
  }),
};

export function buildRequestFeedbackTool<TTool>(
  createTool: (definition: RequestFeedbackToolDefinition) => TTool
): TTool {
  return createTool(requestFeedbackToolDefinition);
}
