import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { type Tool, tool } from "ai";
import { contactCreateInputSchema } from "../../../src/schema/zod.js";

export function buildCreateContactTool(
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"]
): Tool {
  return tool({
    description:
      "Create a new contact after checking duplicates first. Requires display_name and type.",
    inputSchema: contactCreateInputSchema,
    execute: async (input) => {
      try {
        const parsed = contactCreateInputSchema.parse(input);
        return await invokeContactsOperation("contacts_create", parsed);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Create failed",
        };
      }
    },
  });
}
