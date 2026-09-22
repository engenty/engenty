/**
 * Contacts copilot contribution for the app-wide provider.
 */

import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";
import { CONTACTS_MANAGER_AGENT_ID } from "./copilot-context.js";
import { contactKeys } from "./queries.js";

function invalidateContactCopilotQueries({
  queryClient,
  scope,
}: Parameters<NonNullable<UiCopilotContribution["onAssistantTurnFinish"]>>[0]) {
  const entityId = scope.entityId;
  if (typeof entityId === "string" && entityId.length > 0) {
    void queryClient.invalidateQueries({
      queryKey: contactKeys.detail(entityId),
    });
  }
  void queryClient.invalidateQueries({ queryKey: contactKeys.all });
}

export const contactsCopilotContribution: UiCopilotContribution = {
  moduleId: "contacts",
  routeKey: "chat",
  requestedAgentId: CONTACTS_MANAGER_AGENT_ID,
  matches: (ctx) => {
    const currentModule = ctx.scope?.currentModule;
    const entityId = ctx.scope?.entityId;
    return currentModule === "contacts" && typeof entityId === "string";
  },
  onApplySuccess: invalidateContactCopilotQueries,
  onAssistantTurnFinish: invalidateContactCopilotQueries,
};
