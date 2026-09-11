/**
 * Knowledge Base — copilot contribution (KB manager agent + starter prompts).
 */

import { canonicalModulePathname } from "@engenty/ai-core/browser";
import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";
import { invalidateKbDataAfterCopilotAssistantTurn } from "./kb-copilot-invalidate.js";

const KB_MANAGER_AGENT_ID = "knowledge-base.manager";

export const kbCopilotContribution: UiCopilotContribution = {
  matches: (ctx) => {
    // Canonical, not raw: in a space this is `/s/<key>/kb/…`, and
    // failing to recognise it means the copilot opens without the KB agent.
    const path = canonicalModulePathname(ctx.pathname ?? "");
    if (path.startsWith("/mdl/knowledge-base")) {
      return true;
    }
    return ctx.scope?.current_module === "knowledge-base";
  },
  moduleId: "knowledge-base",
  onAssistantTurnFinish: async ({ queryClient, pathname }) => {
    await invalidateKbDataAfterCopilotAssistantTurn(queryClient, pathname);
  },
  requestedAgentId: KB_MANAGER_AGENT_ID,
  routeKey: "chat",
  starterPrompts: [
    {
      id: "kb.capture-inbox",
      label: "Capture raw material",
      prompt:
        "Help me capture raw material for the knowledge base: suggest title, source_type (paste|url|file|chat|other), and the JSON body for POST /api/kb/inbox with snake_case fields. Editors manage sources under Sources (Daten-Quellen); inbox rows back promote/fetch flows.",
    },
    {
      id: "kb_triage",
      label: "Triage capture",
      prompt:
        "I want to triage a knowledge base capture (inbox row, often linked from a source item): propose triage_summary, likely parent article placement, duplicate checks using search, and a PATCH body for /api/kb/inbox/:id. Do not promote without explicit confirmation.",
    },
    {
      id: "kb.answer-citations",
      label: "Answer with citations",
      prompt:
        "Answer using the knowledge base only: search articles (full-text search), cite article titles and ids, and say when evidence is missing.",
    },
    {
      id: "kb_lint",
      label: "Lint suggestions",
      prompt:
        "Run a lightweight lint pass on this KB: list possible orphan drafts, articles missing summary, and broken internal links based on list/search tools; output proposals only, no silent edits.",
    },
  ],
  title: "Knowledge Base",
};
