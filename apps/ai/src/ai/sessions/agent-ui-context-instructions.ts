// Per-run AG-UI runtime context: frontend-tool catalog, run context entries,
// bounded UI-state snapshot, the C6 module skill-catalog hint, and the
// core-resolved page system prompt — joined into one instruction block.

import type {
  AgentUiStateSnapshotV1,
  RunAgentInput,
} from "@engenty/ag-ui-bridge";
import {
  formatAgentUiStateHarnessInstructions,
  resolveCurrentPageModule,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { mergeFrontendToolDefinitions } from "../../../ai/frontend-tools/catalog.js";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import { resolveModuleSkillCatalogHint } from "../skills/module-skill-hint.js";
import { createSkillStorage } from "../skills/skill-storage.js";
import { createEngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import type { AgentUiProducerContext, AiSessionScope } from "./types.js";

const logger = createLogger({ name: "ai.harness.agent-ui-context" });

// The skill-catalog hint is a copilot-lane feature (skills.md C6); workers and
// chatbots resolve skills through their own workspace specs.
const COPILOT_AGENT_ID = "engenty.copilot";

function buildFrontendToolInstructions(
  agentId: string,
  agentUi?: AgentUiProducerContext | null
): string {
  const isChatbot = agentId?.startsWith("chatbot.") ?? false;
  const tools = mergeFrontendToolDefinitions(agentUi?.frontend_tools, {
    includeServerTools: !isChatbot,
  });
  if (tools.length === 0) {
    return "";
  }
  // Frontend tools are native tools the model calls directly by name — their
  // typed schemas are already in the tool list, so no schema dump here. This
  // block is just behavioral guidance (e.g. when to navigate vs. ask).
  const toolNames = tools.map((tool) => tool.name).join(", ");
  const hasDomTools = tools.some(
    (tool) =>
      tool.name === "browser_dom_snapshot" || tool.name === "browser_screenshot"
  );
  const lines = [
    "Some of your tools run in the user's browser (navigation, theme, locale, etc.). Call them directly by name like any other tool; the UI runs them and returns the result.",
    `Browser tools available now: ${toolNames}.`,
    '- For page-opening/navigation requests, use the "navigate" tool with {"to":"/mdl/<moduleId>"} (an internal path). Do not use requestDecision just to ask which page to open when a likely page or module route is known.',
  ];
  if (hasDomTools) {
    lines.push(
      "- Prefer browser_dom_snapshot over browser_screenshot. Scope root_selector from Current page dom_entry_points (main / list / detail / app_bar / sidebar / topbar). Fall back to main if a region selector is missing. Use browser_screenshot only for visual/layout questions the DOM cannot answer."
    );
  }
  return lines.join("\n");
}

function formatRunAgentContextEntries(
  context: RunAgentInput["context"] | undefined
): string {
  if (!context?.length) {
    return "";
  }
  const lines = ["AG-UI run context:"];
  for (const entry of context) {
    const value =
      typeof entry.value === "string"
        ? entry.value
        : JSON.stringify(entry.value);
    lines.push(`- ${entry.description}: ${value}`);
  }
  return lines.join("\n");
}

// C6: cached "Skills for the current module" block, injected beside the
// snapshot section on copilot runs with a module context. Best-effort — a
// failed catalog read never blocks the run.
async function resolveModuleSkillHintSection(input: {
  agentId: string;
  scope: AiSessionScope;
  snapshot: AgentUiStateSnapshotV1;
}): Promise<string> {
  if (input.agentId !== COPILOT_AGENT_ID) {
    return "";
  }
  const moduleId = resolveCurrentPageModule(input.snapshot);
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const userAccessToken = input.scope.userAccessToken?.trim();
  if (!(moduleId && coreBaseUrl && userAccessToken)) {
    return "";
  }
  try {
    const skillStorage = createSkillStorage({
      storage: createEngentyCoreFileStorageClient({
        coreBaseUrl,
        userAccessToken,
      }),
      tenantId: input.scope.tenantId,
    });
    const hint = await resolveModuleSkillCatalogHint({
      moduleId,
      skillStorage,
      tenantId: input.scope.tenantId,
    });
    return hint ?? "";
  } catch (error) {
    logger.warn("module_skill_hint_failed", {
      agent_id: input.agentId,
      error: error instanceof Error ? error.message : String(error),
      module_id: moduleId,
    });
    return "";
  }
}

// Page system prompt resolved by core from the UI-state snapshot (preloads).
async function resolveCorePagePrompt(input: {
  agentId: string;
  scope: AiSessionScope;
  snapshot: AgentUiStateSnapshotV1;
}): Promise<string> {
  const userAccessToken = input.scope.userAccessToken?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(userAccessToken && coreBaseUrl)) {
    return "";
  }
  try {
    const client = new EngentyCoreClient({ coreBaseUrl, userAccessToken });
    const result = await client.resolveAgentSystemPromptFromUiState(
      input.agentId,
      input.snapshot
    );
    return result.system_prompt?.trim() ?? "";
  } catch (error) {
    logger.warn("agent_ui_context_prompt_failed", {
      agent_id: input.agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

export async function buildAgentUiContextInstructions(input: {
  agentId: string;
  agentUi?: AgentUiProducerContext | null;
  runContext?: RunAgentInput["context"];
  scope: AiSessionScope;
}): Promise<string> {
  const frontendToolInstructions = buildFrontendToolInstructions(
    input.agentId,
    input.agentUi
  );
  const runContextInstructions = formatRunAgentContextEntries(input.runContext);
  const snapshot = input.agentUi?.state_snapshot;
  if (!snapshot) {
    return [frontendToolInstructions, runContextInstructions]
      .filter(Boolean)
      .join("\n\n");
  }

  const snapshotInstructions = formatAgentUiStateHarnessInstructions(snapshot);
  const [moduleSkillHint, systemPrompt] = await Promise.all([
    resolveModuleSkillHintSection({
      agentId: input.agentId,
      scope: input.scope,
      snapshot,
    }),
    resolveCorePagePrompt({
      agentId: input.agentId,
      scope: input.scope,
      snapshot,
    }),
  ]);

  return [
    frontendToolInstructions,
    runContextInstructions,
    snapshotInstructions,
    moduleSkillHint,
    systemPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");
}
