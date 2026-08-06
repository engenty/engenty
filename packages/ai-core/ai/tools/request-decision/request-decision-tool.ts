import { z } from "zod";

export const requestDecisionChoiceSchema = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
  label: z.string().min(1),
});

export const requestDecisionInputSchema = z.object({
  body: z.string().optional(),
  choices: z.array(requestDecisionChoiceSchema).min(1).max(6),
  /** Render checkboxes and let the user pick several choices at once. */
  multiSelect: z.boolean().optional(),
  title: z.string().min(1),
});

export type RequestDecisionInput = z.infer<typeof requestDecisionInputSchema>;

export interface RequestDecisionArtifact {
  artifact_id: string;
  artifact_type: "decision";
  body?: string;
  choices: RequestDecisionInput["choices"];
  /** AG-UI `resume[].interruptId` (defaults to `artifact_id`). */
  interrupt_id: string;
  /** Checkbox mode: the user may pick several choices in one answer. */
  multi_select?: boolean;
  title: string;
}

export interface RequestDecisionToolDefinition {
  description: string;
  execute: (input: RequestDecisionInput) => Promise<RequestDecisionArtifact>;
  id: "requestDecision";
  inputSchema: typeof requestDecisionInputSchema;
  toModelOutput: () => { type: "text"; value: string };
}

export function createRequestDecisionArtifact(
  input: RequestDecisionInput
): RequestDecisionArtifact {
  const artifact_id = crypto.randomUUID();
  return {
    artifact_id,
    artifact_type: "decision",
    body: input.body,
    choices: input.choices,
    interrupt_id: artifact_id,
    ...(input.multiSelect ? { multi_select: true } : {}),
    title: input.title,
  };
}

export const requestDecisionToolDefinition: RequestDecisionToolDefinition = {
  id: "requestDecision",
  description:
    "Render an interactive chooser widget for the user. Use this instead of plain numbered or bulleted text when the user asks to choose, approve/decline, or select from up to 6 options (set multiSelect for checkboxes; choices may carry a short description). If the user asks for a chooser with a count but omits exact options, infer reasonable low-risk choices when safe; ask for clarification only when the choices depend on private app data, business rules, or a risky action.",
  inputSchema: requestDecisionInputSchema,
  execute: async (input) => createRequestDecisionArtifact(input),
  toModelOutput: () => ({
    type: "text",
    value:
      "Decision artifact shown to the user. Wait for the user's selection before continuing.",
  }),
};

export function buildRequestDecisionTool<TTool>(
  createTool: (definition: RequestDecisionToolDefinition) => TTool
): TTool {
  return createTool(requestDecisionToolDefinition);
}
