export interface AgenticIngestInstructionInput {
  instructions: string;
}

export const defaultAgenticIngestInstructionInput: AgenticIngestInstructionInput =
  {
    instructions: "",
  };

export function buildAgenticIngestInstructionBlock(
  input: AgenticIngestInstructionInput
) {
  const instructions = input.instructions.trim();
  return ["Agentic ingestion instructions:", instructions || null]
    .filter(Boolean)
    .join("\n\n");
}
