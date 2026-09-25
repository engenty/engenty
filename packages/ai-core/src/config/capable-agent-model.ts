/**
 * Whether a Gateway catalog row can run a user-facing agent turn
 * (low / medium / high effort, copilot chat).
 *
 * Vercel AI Gateway publishes this as the `tool-use` tag. Chat availability
 * alone is not enough: embeddings, OCR-classifiers, and small completion
 * models are often marked available_for_agent without function calling.
 */
export function isCapableAgentModel(input: {
  available_for_agent?: boolean | null;
  tags?: readonly string[] | null;
  tool_use?: boolean | null;
}): boolean {
  const chatOk = input.available_for_agent !== false;
  const tools =
    input.tool_use === true || (input.tags ?? []).includes("tool-use");
  return chatOk && tools;
}
