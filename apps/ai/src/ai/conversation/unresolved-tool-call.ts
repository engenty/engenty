// A tool call the model emitted that never produced a result.
//
// The live case that motivated this: the model invented a tool name
// (`ask_user`) that no agent registers. Mastra has nothing to dispatch, so it
// emits TOOL_CALL_START/ARGS/END and then finishes the run — no tool_end, no
// TOOL_CALL_RESULT. Two things go wrong and neither is self-healing:
//   1. the chat card spins forever (a tool call with no result is "pending"),
//   2. the model is never told, so it re-invents the same tool next turn.
//
// The cure is generic on purpose: ANY dangling call is answered with a tool
// ERROR result. Adding the hallucinated name as a real tool would only teach
// the tool list to grow one hallucination at a time.

/** How many valid tool names to name in the correction. */
const SUGGESTION_LIMIT = 12;

export interface UnresolvedToolCallResult {
  available_tools?: string[];
  code: "unknown_tool" | "tool_did_not_complete";
  error: string;
  ok: false;
  tool_name: string;
}

// Our registry mixes snake_case and camelCase (engenty_tools_search,
// requestDecision), and an invented name rarely matches either convention —
// so compare on letters alone.
function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Levenshtein-free cheap similarity: containment or a shared 4-char prefix. */
function looksRelated(candidate: string, toolName: string): boolean {
  const a = normalizeToolName(candidate);
  const b = normalizeToolName(toolName);
  if (!(a && b)) {
    return false;
  }
  return a.includes(b) || b.includes(a) || a.slice(0, 4) === b.slice(0, 4);
}

/**
 * Rank valid tool names for the correction: near-misses on the invented name
 * first (that is what the model was groping for), then the rest, capped so the
 * error stays readable for a 100-tool agent.
 */
function suggestToolNames(
  toolName: string,
  knownToolNames: readonly string[]
): string[] {
  const related = knownToolNames.filter((name) => looksRelated(name, toolName));
  const rest = knownToolNames.filter((name) => !related.includes(name));
  return [...related, ...rest].slice(0, SUGGESTION_LIMIT);
}

export function buildUnresolvedToolCallResult(params: {
  knownToolNames?: readonly string[];
  toolName: string;
}): UnresolvedToolCallResult {
  const toolName = params.toolName.trim() || "tool";
  const known = params.knownToolNames ?? [];
  // An empty known-set means "we could not enumerate the agent's tools", not
  // "the agent has none" — say the call failed rather than asserting the tool
  // does not exist, which would be a lie the model then reasons from.
  if (known.length === 0) {
    return {
      code: "tool_did_not_complete",
      error: `The tool call "${toolName}" ended without a result. Do not retry it blindly; if you still need it, use a tool you can see in your tool list.`,
      ok: false,
      tool_name: toolName,
    };
  }
  if (known.includes(toolName)) {
    return {
      code: "tool_did_not_complete",
      error: `The tool "${toolName}" was called but produced no result (it may have been interrupted). Retry it or continue without it.`,
      ok: false,
      tool_name: toolName,
    };
  }
  return {
    available_tools: suggestToolNames(toolName, known),
    code: "unknown_tool",
    error: `No tool named "${toolName}" exists. You may only call tools from your tool list — pick the closest one from available_tools and call it with its own schema. To ask the user a question with options, call requestDecision.`,
    ok: false,
    tool_name: toolName,
  };
}
