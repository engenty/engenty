import { isAgentThreadId } from "@engenty/ai-core/browser";
import { ENGENTY_COPILOT_HOST_KEY } from "@engenty/ai-ui";
import { useEngentyThreadsContext } from "@engenty/ai-ui/embed";
import { useQuery } from "@engenty/query-client";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { listAgentThreads } from "../../src/lib/agent-threads-client.js";
import { resolveAiServiceBaseUrl } from "../../src/lib/ai-url.js";
import { resolveAgentChatTransportBlocker } from "../lib/chat/agent-chat-transport.js";
import {
  localizeCopilotChatPath,
  resolveCopilotChatEntryPath,
} from "../paths.js";

/**
 * `/chat` and module root: the chat you were last in HERE → the newest one in
 * this Space → `/chat/new`.
 *
 * "Here" is doing the work. The persisted active thread is now keyed by space
 * for this host (`activeThreadStorageKey`, PLAN-space-chats.md), so reading it
 * can no longer hand back a thread from a different Space — which is exactly
 * why this used to discard it inside a Space and fall to "newest in the list"
 * instead. Newest-in-the-list is a worse answer whenever you have more than one
 * conversation going: it is not the one you were just in.
 */
export function CopilotChatRootRedirect() {
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const location = useLocation();
  const tenantId = currentTenant?.id ?? "";
  const userId = currentUserId ?? "";
  // The copilot's OWN space, straight from the provider that keys its active
  // thread by it. Re-deriving it from `currentSpace` gets a different answer
  // outside `/s/…` — the tenant default instead of the personal space — and the
  // entry would then look for the last-active chat under a key nothing wrote.
  const { activeThreadSpaceId: spaceId, getActiveThreadId } =
    useEngentyThreadsContext();
  const lastActiveThreadId = getActiveThreadId(ENGENTY_COPILOT_HOST_KEY);
  const hasLastActive = Boolean(
    lastActiveThreadId && isAgentThreadId(lastActiveThreadId)
  );
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
      spaceId,
    ],
    queryFn: ({ signal }) =>
      listAgentThreads({
        hostKey: ENGENTY_COPILOT_HOST_KEY,
        serviceBaseUrl,
        tenantId,
        userId,
        limit: 1,
        signal,
        spaceId,
      }),
    enabled: isTransportReady && !hasLastActive,
  });

  const target = useMemo(
    () =>
      localizeCopilotChatPath(
        resolveCopilotChatEntryPath({
          lastActiveThreadId,
          latestThreadIds: (sessionsQuery.data ?? []).map((row) => row.id),
        }),
        location.pathname
      ),
    [lastActiveThreadId, location.pathname, sessionsQuery.data]
  );

  // Do not fall through to `/chat/new` while the list is still unknown.
  // A disabled query (`enabled: false`) is not `isLoading`, so waiting on
  // that flag alone used to navigate to a blank chat the moment transport
  // was not yet ready — which is exactly the hop from another agent's desk.
  const waitingForLatest =
    !hasLastActive &&
    (!isTransportReady || sessionsQuery.isPending || sessionsQuery.isLoading);
  if (waitingForLatest) {
    return null;
  }

  return <Navigate replace to={target} />;
}
