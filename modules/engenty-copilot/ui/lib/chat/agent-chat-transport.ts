export type AgentChatTransportBlocker = "scope" | "service";

export function resolveAgentChatTransportBlocker(params: {
  resolvedAiBase: string | undefined;
  scopeReady: boolean;
}): AgentChatTransportBlocker | null {
  if (!params.scopeReady) {
    return "scope";
  }
  if (params.resolvedAiBase === undefined) {
    return "service";
  }
  return null;
}
