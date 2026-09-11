"use client";

// Root embed provider: serviceBaseUrl, frontend tools, host registry, and EngentyThreadsProvider mount.
// Apps/ui and modules wrap routes with EngentyAI once; each EngentyAgent reads a hostKey-scoped lane.

import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { resolveAppsAiFrontendTools } from "../ag-ui/apps-ai/index.js";
import { EngentyThreadsProvider } from "../threads/engenty-threads-provider.js";
import type {
  AgentHost,
  EngentyAIContextValue,
  EngentyAIProps,
} from "./types.js";

export const EngentyAIContext = createContext<EngentyAIContextValue | null>(
  null
);

function defaultFormatRequestError(message: string): string {
  return message;
}

function defaultFormatTransportBlocker(
  blocker: "scope" | "ai_base_url"
): string {
  return blocker === "ai_base_url"
    ? "AI service URL is not configured."
    : "AI scope is not ready.";
}

export function EngentyAI({
  activeThreadSpaceId,
  agentToolInvalidation,
  children,
  executeFrontendTool,
  formatRequestError = defaultFormatRequestError,
  formatTransportBlocker = defaultFormatTransportBlocker,
  frontendTools = [],
  queryClient,
  resolveKbArticleHref,
  serviceBaseUrl,
  stateSnapshot,
  tenantId,
  threadsRealtimeClient,
  userId,
}: EngentyAIProps) {
  const hostsRef = useRef(new Map<string, AgentHost>());
  // Per-hostKey listener sets — `useAgentHost` consumers subscribe to
  // notifications when the registered host object changes so sibling-subtree
  // consumers re-render on host updates (host object identity flips when the
  // EngentyAgent's session hook produces new messages/state). Without this,
  // consumers via the registry path read stale hosts after the first render.
  const listenersRef = useRef(new Map<string, Set<() => void>>());
  // Pending notifications coalesced into a single microtask flush. We must
  // defer notify calls because `registerHost` runs during EngentyAgent's
  // render — listeners are `useSyncExternalStore` callbacks that schedule
  // setState in subscribed components, and React forbids cross-component
  // setState during render ("Cannot update a component while rendering a
  // different component"). Microtask defers notification until after the
  // current render commits while still firing before the next paint.
  const pendingNotifyRef = useRef(new Set<string>());
  const normalizedServiceBaseUrl = serviceBaseUrl?.trim() ?? "";
  const resolvedFrontendTools = useMemo<FrontendToolDefinition[]>(
    () => resolveAppsAiFrontendTools(frontendTools),
    [frontendTools]
  );
  const transportBlocker = normalizedServiceBaseUrl
    ? tenantId && userId
      ? null
      : "scope"
    : "ai_base_url";

  const flushHostNotifications = useCallback(() => {
    const keys = Array.from(pendingNotifyRef.current);
    pendingNotifyRef.current.clear();
    for (const hostKey of keys) {
      const listeners = listenersRef.current.get(hostKey);
      if (!listeners) {
        continue;
      }
      // Snapshot to a fresh array so unsubscribes during iteration don't
      // skip listeners (Set iteration would be safe, but this also protects
      // against listeners that call `subscribeHost` re-entrantly).
      for (const listener of Array.from(listeners)) {
        listener();
      }
    }
  }, []);

  const scheduleHostNotification = useCallback(
    (hostKey: string) => {
      const wasEmpty = pendingNotifyRef.current.size === 0;
      pendingNotifyRef.current.add(hostKey);
      if (wasEmpty) {
        queueMicrotask(flushHostNotifications);
      }
    },
    [flushHostNotifications]
  );

  const registerHost = useCallback(
    (host: AgentHost) => {
      const previous = hostsRef.current.get(host.hostKey);
      hostsRef.current.set(host.hostKey, host);
      if (previous !== host) {
        scheduleHostNotification(host.hostKey);
      }
    },
    [scheduleHostNotification]
  );

  const unregisterHost = useCallback(
    (hostKey: string, host: AgentHost) => {
      if (hostsRef.current.get(hostKey) !== host) {
        return;
      }
      hostsRef.current.delete(hostKey);
      scheduleHostNotification(hostKey);
    },
    [scheduleHostNotification]
  );

  const resolveHost = useCallback(
    (hostKey: string) => hostsRef.current.get(hostKey) ?? null,
    []
  );

  const subscribeHost = useCallback((hostKey: string, listener: () => void) => {
    let listeners = listenersRef.current.get(hostKey);
    if (!listeners) {
      listeners = new Set();
      listenersRef.current.set(hostKey, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = listenersRef.current.get(hostKey);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        listenersRef.current.delete(hostKey);
      }
    };
  }, []);

  const value = useMemo<EngentyAIContextValue>(
    () => ({
      agentToolInvalidation,
      executeFrontendTool,
      formatRequestError,
      formatTransportBlocker,
      frontendTools: resolvedFrontendTools,
      isTransportReady: transportBlocker === null,
      queryClient,
      registerHost,
      resolveHost,
      resolveKbArticleHref,
      serviceBaseUrl: normalizedServiceBaseUrl,
      stateSnapshot,
      subscribeHost,
      tenantId,
      threadsRealtimeClient,
      transportBlocker,
      unregisterHost,
    }),
    [
      agentToolInvalidation,
      executeFrontendTool,
      formatRequestError,
      formatTransportBlocker,
      normalizedServiceBaseUrl,
      queryClient,
      registerHost,
      resolveHost,
      resolveKbArticleHref,
      resolvedFrontendTools,
      stateSnapshot,
      subscribeHost,
      tenantId,
      threadsRealtimeClient,
      transportBlocker,
      unregisterHost,
    ]
  );

  const scopeReady = Boolean(tenantId && userId);

  return (
    <EngentyAIContext.Provider value={value}>
      {scopeReady ? (
        <EngentyThreadsProvider
          activeThreadSpaceId={activeThreadSpaceId}
          realtimeClient={threadsRealtimeClient ?? null}
          tenantId={tenantId as string}
          userId={userId as string}
        >
          {children}
        </EngentyThreadsProvider>
      ) : (
        children
      )}
    </EngentyAIContext.Provider>
  );
}

export function useEngentyAIContext(): EngentyAIContextValue {
  const context = useContext(EngentyAIContext);
  if (!context) {
    throw new Error("useAgentHost must be used inside EngentyAI.");
  }
  return context;
}
