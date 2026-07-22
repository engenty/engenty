/**
 * Inbox copilot contribution: starter prompts on inbox routes.
 */

import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";

export const inboxCopilotContribution: UiCopilotContribution = {
  moduleId: "inbox",
  routeKey: "chat",
  title: "Inbox",
  matches: (ctx) => ctx.scope?.currentModule === "inbox",
  starterPrompts: [
    {
      id: "inbox_triage_new",
      label: "Triage new mail",
      prompt:
        "Triage my new mail: summarize what needs attention and propose status changes.",
    },
    {
      id: "inbox_summarize_thread",
      label: "Summarize this thread",
      prompt:
        "Summarize the current inbox thread using page context. Quote faithfully; do not invent content.",
    },
    {
      id: "inbox_search_about",
      label: "Search mail about…",
      prompt:
        "Search my synced mail about [topic]. Use inbox_message_search via the catalog tools.",
    },
    {
      id: "inbox_connect_account",
      label: "Connect an email account",
      prompt:
        "Help me connect a Gmail or Outlook account and enable inbox sync.",
    },
    {
      id: "inbox_sync_stale",
      label: "Why is sync stale?",
      prompt:
        "Check my mail accounts and sync state. Explain if sync is disabled, failing, or credentials need re-auth.",
    },
  ],
};
