import {
  appsAiThreadDetailQueryKey,
  appsAiThreadMessagesQueryKey,
  appsAiThreadsListQueryKey,
} from "./apps-ai-session-api.js";

const moduleCopilotQueryRoot = ["engenty-copilot", "agent-sessions"] as const;

export interface AppsAiCopilotModulePanelQueryKeyParams {
  agentId?: string | null;
  tenantId: string;
  userId: string;
}

/** TanStack keys for module panel list/detail/messages (tenant + user scoped). */
export function appsAiCopilotModulePanelQueryKeys(
  params: AppsAiCopilotModulePanelQueryKeyParams
) {
  const agentKey = params.agentId?.trim() || "all";
  return {
    sessionDetail: (threadId: string) =>
      [
        ...moduleCopilotQueryRoot,
        "detail",
        params.tenantId,
        params.userId,
        threadId,
      ] as const,
    sessionMessages: (threadId: string) =>
      [
        ...moduleCopilotQueryRoot,
        "messages",
        params.tenantId,
        params.userId,
        threadId,
      ] as const,
    sessionsList: [
      ...moduleCopilotQueryRoot,
      "list",
      params.tenantId,
      params.userId,
      agentKey,
    ] as const,
  };
}

export interface AppsAiCopilotAppsAiQueryKeyParams {
  agentId?: string | null;
  serviceBaseUrl: string;
}

/** TanStack keys for drawer/global surfaces using apps/ai session APIs. */
export function appsAiCopilotAppsAiQueryKeys(
  params: AppsAiCopilotAppsAiQueryKeyParams
) {
  return {
    sessionDetail: (threadId: string) =>
      appsAiThreadDetailQueryKey({
        serviceBaseUrl: params.serviceBaseUrl,
        threadId,
      }),
    sessionMessages: (threadId: string) =>
      appsAiThreadMessagesQueryKey({
        serviceBaseUrl: params.serviceBaseUrl,
        threadId,
      }),
    sessionsList: appsAiThreadsListQueryKey({
      agentId: params.agentId,
      serviceBaseUrl: params.serviceBaseUrl,
    }),
  };
}
