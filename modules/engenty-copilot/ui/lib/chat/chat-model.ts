import { appsAiCopilotModulePanelQueryKeys } from "@engenty/ai-ui";

export const agentChatQueryRoot = [
  "engenty-copilot",
  "agent-sessions",
] as const;

export const agentRegistryQueryRoot = [
  "engenty-copilot",
  "agent-registry",
] as const;

export function agentSessionsListQueryKey(params: {
  agentId?: string | null;
  tenantId: string;
  userId: string;
}) {
  return appsAiCopilotModulePanelQueryKeys(params).sessionsList;
}

export function agentSessionMessagesQueryKey(params: {
  threadId: string;
  tenantId: string;
  userId: string;
}) {
  return appsAiCopilotModulePanelQueryKeys(params).sessionMessages(
    params.threadId
  );
}

export function agentSessionDetailQueryKey(params: {
  threadId: string;
  tenantId: string;
  userId: string;
}) {
  return appsAiCopilotModulePanelQueryKeys(params).sessionDetail(
    params.threadId
  );
}

export function agentRegistryListQueryKey(params: {
  tenantId: string;
  userId: string;
}) {
  return [...agentRegistryQueryRoot, "list", params.tenantId, params.userId];
}

export function agentChatSearchQueryKey(params: {
  agentId?: string | null;
  query: string;
  tenantId: string;
  userId: string;
}) {
  return [
    ...agentChatQueryRoot,
    "search",
    params.tenantId,
    params.userId,
    params.agentId?.trim() || "all",
    params.query,
  ] as const;
}

export function agentChatPanelStatus<TStatus>(params: {
  hasPendingMessage: boolean;
  submitStatus: TStatus;
}): TStatus | "submitted" {
  return params.hasPendingMessage ? "submitted" : params.submitStatus;
}
