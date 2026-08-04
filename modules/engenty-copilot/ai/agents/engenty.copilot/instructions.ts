import { buildAgentLayeredPrompt } from "@engenty/ai-core";
import agentsMarkdown from "./AGENTS.md";
import skillDiscoveryMarkdown from "./SKILLS.md";
import soulMarkdown from "./SOUL.md";

/** Per-run facts appended after static AGENTS/SOUL layers (also mirrored in harness runtime context). */
export function buildEngentyCopilotRuntimeContextSection(): string {
  const baseUrl = process.env.ENGENTY_CORE_BASE_URL?.trim() || "/";
  const today = new Date().toISOString().slice(0, 10);
  return [
    "## Runtime context",
    "",
    `- Base URL: ${baseUrl}`,
    `- Current date: ${today}`,
    "- Each run includes an AG-UI UI state snapshot (pathname, page module, selection, copilot shell, and Current page brief: page_type/title/description, list filters/search/total, compact previews, dom_entry_points). Use that for where the user is in the app — not the browser address bar and not engenty_tools_context. For live UI inspection, prefer browser_dom_snapshot scoped to dom_entry_points over browser_screenshot.",
    "- Tenant and user are request-scoped from the current authorization token; use engenty_tools_context for workspace identity lookups — not route or URL.",
    "- Active modules are dynamic plugin contributions and tenant-scoped. Use engenty_tools_modules when you need module names, slugs, descriptions, base URLs, or tool counts.",
    "- Do not assume a module exists from static instructions; plugins can be enabled, disabled, installed, or removed per tenant.",
  ].join("\n");
}

/**
 * Compose Mastra `instructions` from AGENTS.md + SOUL.md + dynamic runtime context.
 * Pass layer overrides to replace only that file's body (admin override / reset seed).
 */
export function buildEngentyCopilotInstructions(overrides?: {
  agents?: string | null;
  skills?: string | null;
  soul?: string | null;
}): string {
  const agentsBody =
    overrides?.agents && overrides.agents.trim().length > 0
      ? overrides.agents.trim()
      : agentsMarkdown.trim();
  const skillsBody =
    overrides?.skills && overrides.skills.trim().length > 0
      ? overrides.skills.trim()
      : skillDiscoveryMarkdown.trim();
  const soulBody =
    overrides?.soul && overrides.soul.trim().length > 0
      ? overrides.soul.trim()
      : soulMarkdown.trim();
  return buildAgentLayeredPrompt({
    // AGENTS identity first, then the SKILLS operating doctrine as an
    // ordered addendum. Both are static, so they stay in the cacheable prompt
    // prefix — module-aware skill selection is driven at runtime by the agent
    // calling skill_search against the per-run AG-UI page_module, never by
    // injecting module-specific skills into this prompt.
    agentsLayers: [agentsBody, skillsBody],
    soulPrompt: soulBody,
    specialistPrompt: buildEngentyCopilotRuntimeContextSection(),
  });
}

/** Built-in `engenty.copilot` system prompt (AGENTS + SOUL + runtime context). */
export const ENGENTY_INSTRUCTIONS = buildEngentyCopilotInstructions();
