import {
  ENGENTY_COPILOT_HOST_KEY,
  readActiveThreadIdForHost,
} from "@engenty/ai-ui";
import { useQuery } from "@engenty/query-client";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { listAgentThreads } from "../../src/lib/agent-threads-client.js";
import { resolveAiServiceBaseUrl } from "../../src/lib/ai-url.js";
import { resolveAgentChatTransportBlocker } from "../lib/chat/agent-chat-transport.js";
import { resolveCopilotChatEntryPath } from "../paths.js";

/**
 * `/chat` and module root: last-active → latest session in list → `/chat/new`.
 */
export function CopilotChatRootRedirect() {
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? "";
  const userId = currentUserId ?? "";
  const scopeReady = Boolean(tenantId && userId);
  const serviceBaseUrl = resolveAiServiceBaseUrl() ?? "";
  const transportBlocker = useMemo(
    () =>
      resolveAgentChatTransportBlocker({
        resolvedAiBase: serviceBaseUrl || undefined,
        scopeReady,
      }),
    [scopeReady, serviceBaseUrl]
  );
  const isTransportReady = transportBlocker === null;

  const sessionsQuery = useQuery({
    queryKey: [
      "engenty-copilot",
      "chat-root-redirect",
      tenantId,
      userId,
      ENGENTY_COPILOT_HOST_KEY,
    ],
    queryFn: ({ signal }) =>
      listAgentThreads({
        hostKey: ENGENTY_COPILOT_HOST_KEY,
        serviceBaseUrl,
        tenantId,
        userId,
        limit: 1,
        signal,
      }),
    enabled: isTransportReady,
  });

  const target = useMemo(
    () =>
      resolveCopilotChatEntryPath({
        lastActiveThreadId: readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY),
        latestThreadIds: (sessionsQuery.data ?? []).map((row) => row.id),
      }),
    [sessionsQuery.data]
  );

  if (isTransportReady && sessionsQuery.isLoading) {
    return null;
  }

  return <Navigate replace to={target} />;
}
