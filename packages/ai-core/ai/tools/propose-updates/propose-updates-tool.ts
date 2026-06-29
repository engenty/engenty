import { z } from "zod";
import {
  FIELD_SUGGESTIONS_ARTIFACT_TYPE,
  type FieldSuggestion,
  fieldSuggestionSchema,
} from "../../../src/artifacts/field-suggestions.js";

export const proposeUpdatesInputSchema = z.object({
  title: z
    .string()
    .optional()
    .describe(
      'Optional heading shown on the approval card (e.g. "Suggested profile updates").'
    ),
  suggestions: z
    .array(fieldSuggestionSchema)
    .min(1)
    .describe(
      "Fields to propose. Each entry must include a field name and the proposed value. Include source_url and evidence_snippet when available so the user can verify the source."
    ),
});

export type ProposeUpdatesInput = z.infer<typeof proposeUpdatesInputSchema>;

export interface ProposeUpdatesArtifact {
  artifact_emitted: true;
  artifact_id: string;
  artifact_type: typeof FIELD_SUGGESTIONS_ARTIFACT_TYPE;
  count: number;
  interrupt_id: string;
  ok: true;
  suggestions: FieldSuggestion[];
  title?: string;
}

export interface ProposeUpdatesToolDefinition {
  description: string;
  execute: (input: ProposeUpdatesInput) => Promise<ProposeUpdatesArtifact>;
  id: "proposeUpdates";
  inputSchema: typeof proposeUpdatesInputSchema;
  toModelOutput: () => { type: "text"; value: string };
}

export function createProposeUpdatesArtifact(
  input: ProposeUpdatesInput
): ProposeUpdatesArtifact {
  const artifact_id = crypto.randomUUID();
  return {
    artifact_emitted: true,
    artifact_id,
    artifact_type: FIELD_SUGGESTIONS_ARTIFACT_TYPE,
    count: input.suggestions.length,
    interrupt_id: artifact_id,
    ok: true,
    suggestions: input.suggestions,
    title: input.title,
  };
}

export const proposeUpdatesToolDefinition: ProposeUpdatesToolDefinition = {
  id: "proposeUpdates",
  description:
    "Present proposed field-value updates to the user for review and selective approval before writing them. Use this when you have researched or inferred values for one or more fields and need the user to confirm which ones to apply. Include source_url and evidence_snippet where available. The user checks individual fields, optionally picks from candidate values, then approves or rejects. Wait for the user's response before applying any changes.",
  inputSchema: proposeUpdatesInputSchema,
  execute: async (input) => createProposeUpdatesArtifact(input),
  toModelOutput: () => ({
    type: "text",
    value:
      "Field update proposal shown to the user. Wait for their approval before applying any changes.",
  }),
};

export function buildProposeUpdatesTool<TTool>(
  createTool: (definition: ProposeUpdatesToolDefinition) => TTool
): TTool {
  return createTool(proposeUpdatesToolDefinition);
}
