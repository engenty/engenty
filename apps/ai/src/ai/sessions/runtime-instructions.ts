// Per-run runtime context instructions, injected as a system message before the
// user turn: tenant/user identity + workspace (name, email, role), AG-UI app
// context (route, selection, shell state), and the UI language preference.
//
// Shared across the chat runtimes (the legacy harness, the control plane, and the
// Harness Session) so every run sees the SAME context — without it, a run greets
// the user but can't answer "what's my email?".
import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { buildAgentUiContextInstructions } from "./agent-ui-context-instructions.js";
import { buildRuntimeContextInstructions } from "./runtime-context.js";
import type { AgentUiProducerContext, AiSessionScope } from "./types.js";

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German (Deutsch)",
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  it: "Italian (Italiano)",
};

function resolveUiLanguage(
  routeContext: Record<string, unknown> | null | undefined
): string | null {
  if (!(routeContext && typeof routeContext === "object")) {
    return null;
  }
  const scopeObj =
    "scope" in routeContext &&
    routeContext.scope &&
    typeof routeContext.scope === "object"
      ? (routeContext.scope as Record<string, unknown>)
      : null;
  const uiLanguage =
    scopeObj && typeof scopeObj.ui_language === "string"
      ? scopeObj.ui_language
      : null;
  const directUiLanguage =
    typeof routeContext.ui_language === "string"
      ? routeContext.ui_language
      : null;
  return uiLanguage || directUiLanguage;
}

export interface SessionRuntimeInstructionsInput {
  agentId: string;
  agentUi?: AgentUiProducerContext | null;
  routeContext?: Record<string, unknown> | null;
  runContext?: RunAgentInput["context"];
  scope: AiSessionScope;
  threadId: string;
}

/**
 * Build the combined runtime-context system instructions for a run: workspace
 * identity, AG-UI app context, and language preference, joined into one block.
 */
export async function buildSessionRuntimeInstructions(
  input: SessionRuntimeInstructionsInput
): Promise<string> {
  const [runtimeContext, agentUiContext] = await Promise.all([
    buildRuntimeContextInstructions({
      scope: input.scope,
      threadId: input.threadId,
    }),
    buildAgentUiContextInstructions({
      agentId: input.agentId,
      agentUi: input.agentUi,
      runContext: input.runContext,
      scope: input.scope,
    }),
  ]);

  let languageInstruction = "";
  const lang = resolveUiLanguage(input.routeContext);
  if (lang) {
    const langName = LANGUAGE_NAMES[lang.toLowerCase()] || lang;
    languageInstruction = `## Language Instruction\n- The user's preferred UI language is ${langName}.\n- Please respond to the user in ${langName}.`;
  }

  return [runtimeContext, agentUiContext, languageInstruction]
    .filter(Boolean)
    .join("\n\n");
}
