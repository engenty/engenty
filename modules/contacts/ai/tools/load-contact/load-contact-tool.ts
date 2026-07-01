import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { tool } from "ai";
import { z } from "zod";
import { resolveScopedContactId } from "../resolve-contact-id.js";

const loadContactToolInputSchema = z.object({
  id: z.string().optional(),
});

export function buildLoadContactTool(
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"],
  ctx: ToolExecutionContext
) {
  return tool({
    description:
      "Load the current contact record. Defaults to the current scoped contact.",
    inputSchema: loadContactToolInputSchema,
    execute: async ({ id }) => {
      const contactId = resolveScopedContactId(id, ctx.scope);
      if (!contactId) {
        return { error: "No contact ID in scope; provide id input." };
      }
      return invokeContactsOperation("contacts_get", { id: contactId });
    },
  });
}
