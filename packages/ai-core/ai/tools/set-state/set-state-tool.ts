import { z } from "zod";

export const setStateInputSchema = z.object({
  key: z.string().min(1).describe("The shared-state key to set."),
  value: z.unknown().describe("The new JSON value for the key."),
});

export type SetStateInput = z.infer<typeof setStateInputSchema>;

export interface SetStateToolResult {
  key: string;
  ok: true;
  value: unknown;
}

export interface SetStateToolDefinition {
  description: string;
  execute: (input: SetStateInput) => Promise<SetStateToolResult>;
  id: "set_state";
  inputSchema: typeof setStateInputSchema;
}

/**
 * Agent → app shared state (Enhancing Copilot Ch.6). The agent calls `set_state`
 * to publish a value under `key`; the harness echoes the result into a `STATE_DELTA`
 * so the UI (`useEngentyAgentState`) reads it reactively. The tool itself just
 * validates + echoes — the harness owns the wire emission.
 */
export const setStateToolDefinition: SetStateToolDefinition = {
  id: "set_state",
  description:
    "Publish a value into shared UI state under `key`. The app reads shared state reactively (e.g. a plan panel updates live as you set it). Use for state you compute and want reflected on the user's screen — not for chat replies.",
  inputSchema: setStateInputSchema,
  execute: async ({ key, value }) => ({ key, ok: true, value }),
};

export function buildSetStateTool<TTool>(
  createTool: (definition: SetStateToolDefinition) => TTool
): TTool {
  return createTool(setStateToolDefinition);
}
