"use client";

import { registerToolCallUi } from "@engenty/ai-ui";
import { ToolCallLoadContactCard } from "./components/copilot/tool-call-load-contact-card.js";

let registered = false;

export function registerContactsToolCallUi() {
  if (registered) {
    return;
  }
  registered = true;

  registerToolCallUi({
    id: "contacts_load_contact",
    priority: 50,
    match: (ctx) =>
      ctx.toolName === "loadContact" || ctx.resolvedToolName === "loadContact",
    Card: ToolCallLoadContactCard,
  });
}
