import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { type Tool, tool } from "ai";
import { contactRelationCreateInputSchema } from "../../../src/schema/contact-relations.js";

export function buildCreateContactRelationTool(
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"]
): Tool {
  return tool({
    description:
      "Create a typed relation between two contacts, for example a person working at an organisation.",
    inputSchema: contactRelationCreateInputSchema,
    execute: async (input) => {
      try {
        const parsed = contactRelationCreateInputSchema.parse(input);
        return await invokeContactsOperation(
          "contacts_create_relation",
          parsed
        );
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "Create relation failed",
        };
      }
    },
  });
}
