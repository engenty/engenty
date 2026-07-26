"use client";

// Single agent lane UI: binds hostKey → apps/ai session, transcript, submit, and streaming status.
// `useAgentHost(hostKey)` exposes the same lane state without rendering the full chat surface.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  appsAiThreadDetailQueryKey,
  appsAiThreadMessagesQueryKey,
  appsAiThreadsListQueryKey,
  resolvePendingUserInsertIndex,
  resolvePendingUserTextForTranscript,
} from "../ag-ui/apps-ai/index.js";
import { useEngentyAgUiAppsAiSession } from "../ag-ui/apps-ai/use-engenty-ag-ui-apps-ai-session.js";
import { useEngentyAIContext } from "./engenty-ai-provider.js";
import type { AgentHost, EngentyAgentProps, HostConfig } from "./types.js";

const AgentHostContext = createContext<AgentHost | null>(null);

function normalizeHostConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeHostConfigValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalizeHostConfigValue(record[key])])
    );
  }
  return value;
}

function areRouteContextsEqual(
  left: HostConfig["routeContext"],
  right: HostConfig["routeContext"]
): boolean {
  if (left === right) {
    return true;
  }
  return (
    left.moduleId === right.moduleId &&
    left.pathname === right.pathname &&
    left.routeKey === right.routeKey &&
    JSON.stringify(normalizeHostConfigValue(left.scope ?? {})) ===
      JSON.stringify(normalizeHostConfigValue(right.scope ?? {}))
  );
}

function areHostConfigValuesEqual(
  key: keyof HostConfig,
  left: unknown,
  right: unknown
): boolean {
  if (key === "routeContext") {
    return areRouteContextsEqual(
      left as HostConfig["routeContext"],
      right as HostConfig["routeContext"]
    );
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => Object.is(item, right[index]))
    );
  }
  return Object.is(left, right);
}

function areHostConfigsEqual(left: HostConfig, right: HostConfig): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const hostConfigKey = key as keyof HostConfig;
    if (
      !areHostConfigValuesEqual(
        hostConfigKey,
        left[hostConfigKey],
        right[hostConfigKey]
      )
    ) {
      return false;
    }
  }
  return true;
}

function createHostConfig(props: EngentyAgentProps): HostConfig {
  const hostConfig: HostConfig = {
    agentId: props.agentId,
    hostKey: props.hostKey,
    routeContext: props.routeContext,
    threadId: props.threadId,
  };
  if (props.effort !== undefined) {
    hostConfig.effort = props.effort;
  }
  if (props.initialMessages !== undefined) {
    hostConfig.initialMessages = props.initialMessages;
  }
  if (props.messagesQueryKey !== undefined) {
    hostConfig.messagesQueryKey = props.messagesQueryKey;
  }
  if (props.modelId !== undefined) {
    hostConfig.modelId = props.modelId;
  }
  if (props.onMessagesSnapshot !== undefined) {
    hostConfig.onMessagesSnapshot = props.onMessagesSnapshot;
  }
  if (props.onThreadCreated !== undefined) {
    hostConfig.onThreadCreated = props.onThreadCreated;
  }
  if (props.openInterruptFromSession !== undefined) {
    hostConfig.openInterruptFromSession = props.openInterruptFromSession;
  }
  if (props.pathname !== undefined) {
    hostConfig.pathname = props.pathname;
  }
  if (props.threadDetailQueryKey !== undefined) {
    hostConfig.threadDetailQueryKey = props.threadDetailQueryKey;
  }
  if (props.threadsListQueryKey !== undefined) {
    hostConfig.threadsListQueryKey = props.threadsListQueryKey;
  }
  if (props.stableSessionKey !== undefined) {
    hostConfig.stableSessionKey = props.stableSessionKey;
  }
  if (props.hydrateEnabled !== undefined) {
    hostConfig.hydrateEnabled = props.hydrateEnabled;
  }
  if (props.authoritativeUrlThreadId !== undefined) {
    hostConfig.authoritativeUrlThreadId = props.authoritativeUrlThreadId;
  }
  return hostConfig;
}

// Child patches from `useAgentHostConfig` only contribute fields the host
// hasn't fixed. `threadId` and `hydrateEnabled` belong to the host because
// the host's owner decides which server session is bound and when transcript
// hydration runs (other hosts mount with `threadId: null` and let the child
// supply `stableSessionKey`, query keys, etc.).
function mergeChildHostConfig(
  current: Partial<HostConfig>,
  patch: Partial<HostConfig>
): Partial<HostConfig> {
  const {
    hydrateEnabled: _hydrateIgnored,
    threadId: _sessionIgnored,
    ...rest
  } = patch;
  return { ...current, ...rest };
}

export function EngentyAgent(props: EngentyAgentProps) {
  const ai = useEngentyAIContext();
  const propHostConfig = useMemo(
    () => createHostConfig(props),
    [
      props.agentId,
      props.effort,
      props.hostKey,
      props.initialMessages,
      props.messagesQueryKey,
      props.modelId,
      props.onMessagesSnapshot,
      props.onThreadCreated,
      props.openInterruptFromSession,
      props.pathname,
      props.routeContext,
      props.threadDetailQueryKey,
      props.threadId,
      props.threadsListQueryKey,
      props.stableSessionKey,
      props.hydrateEnabled,
      props.authoritativeUrlThreadId,
    ]
  );
  const [childHostConfig, setChildHostConfig] = useState<Partial<HostConfig>>(
    {}
  );

  const effectiveHostConfig = useMemo((): HostConfig => {
    const merged: HostConfig = {
      ...propHostConfig,
      ...childHostConfig,
      hydrateEnabled: propHostConfig.hydrateEnabled,
      threadId: propHostConfig.threadId,
    };
    return merged;
  }, [childHostConfig, propHostConfig]);

  const configureHost = useCallback(
    (next: Partial<HostConfig>) => {
      if ("threadId" in next) {
        return;
      }
      setChildHostConfig((current) => {
        const merged = mergeChildHostConfig(current, next);
        const nextHostConfig = {
          ...propHostConfig,
          ...merged,
          hydrateEnabled: propHostConfig.hydrateEnabled,
          threadId: propHostConfig.threadId,
        };
        const currentHostConfig = {
          ...propHostConfig,
          ...current,
          hydrateEnabled: propHostConfig.hydrateEnabled,
          threadId: propHostConfig.threadId,
        };
        return areHostConfigsEqual(currentHostConfig, nextHostConfig)
          ? current
          : merged;
      });
    },
    [propHostConfig]
  );

  const threadDetailQueryKey =
    effectiveHostConfig.threadDetailQueryKey ??
    (effectiveHostConfig.threadId
      ? appsAiThreadDetailQueryKey({
          serviceBaseUrl: ai.serviceBaseUrl,
          threadId: effectiveHostConfig.threadId,
        })
      : undefined);
  const messagesQueryKey =
    effectiveHostConfig.messagesQueryKey ??
    (effectiveHostConfig.threadId
      ? appsAiThreadMessagesQueryKey({
          serviceBaseUrl: ai.serviceBaseUrl,
          threadId: effectiveHostConfig.threadId,
        })
      : undefined);
  const threadsListQueryKey =
    effectiveHostConfig.threadsListQueryKey ??
    appsAiThreadsListQueryKey({
      agentId: effectiveHostConfig.agentId,
      hostKey: effectiveHostConfig.hostKey,
      serviceBaseUrl: ai.serviceBaseUrl,
    });

  const session = useEngentyAgUiAppsAiSession({
    agentId: effectiveHostConfig.agentId,
    agentToolInvalidation: ai.agentToolInvalidation,
    effort: effectiveHostConfig.effort,
    hostKey: effectiveHostConfig.hostKey,
    executeFrontendTool: ai.executeFrontendTool,
    formatRequestError: ai.formatRequestError,
    formatTransportBlocker: ai.formatTransportBlocker,
    frontendTools: ai.frontendTools,
    hydrateEnabled: effectiveHostConfig.hydrateEnabled,
    initialMessages: effectiveHostConfig.initialMessages,
    isTransportReady: ai.isTransportReady,
    messagesQueryKey,
    modelId: effectiveHostConfig.modelId ?? "",
    onMessagesSnapshot: effectiveHostConfig.onMessagesSnapshot,
    // Notify both the host mount (e.g. shell that mirrors localStorage) and any
    // child config (e.g. full-page chat that queues idle navigation).
    onThreadCreated: (threadId: string) => {
      props.onThreadCreated?.(threadId);
      effectiveHostConfig.onThreadCreated?.(threadId);
    },
    openInterruptFromSession: effectiveHostConfig.openInterruptFromSession,
    pathname:
      effectiveHostConfig.pathname ??
      effectiveHostConfig.routeContext.pathname ??
      "",
    queryClient: ai.queryClient,
    routeContext: effectiveHostConfig.routeContext,
    serviceBaseUrl: ai.serviceBaseUrl,
    threadDetailQueryKey,
    threadId: effectiveHostConfig.threadId,
    threadsListQueryKey,
    stableSessionKey: effectiveHostConfig.stableSessionKey,
    stateSnapshot: ai.stateSnapshot,
    transportBlocker: ai.transportBlocker,
    authoritativeUrlThreadId: effectiveHostConfig.authoritativeUrlThreadId,
    realtimeClient: ai.threadsRealtimeClient ?? null,
  });

  const pendingUserText = useMemo(
    () =>
      resolvePendingUserTextForTranscript(
        session.copilotMessages,
        session.pendingSend
      ),
    [session.copilotMessages, session.pendingSend]
  );
  const pendingUserInsertIndex = useMemo(
    () =>
      resolvePendingUserInsertIndex(
        session.copilotMessages,
        session.pendingSend
      ),
    [session.copilotMessages, session.pendingSend]
  );

  const host = useMemo(
    (): AgentHost => ({
      activeThreadId: session.activeThreadId,
      awaitingInterrupt: session.awaitingInterrupt,
      openInterruptFromStream: session.openInterruptFromStream,
      pendingInterruptToolCallIds: session.pendingInterruptToolCallIds,
      optimisticInterruptResults: session.optimisticInterruptResults,
      respond: session.respond,
      configureHost,
      config: effectiveHostConfig,
      hostKey: effectiveHostConfig.hostKey,
      cancel: session.cancel,
      copilotMessages: session.copilotMessages,
      error: session.error,
      events: session.events,
      messages: session.messages,
      pendingSend: session.pendingSend,
      pendingUserText,
      pendingUserInsertIndex,
      reset: session.reset,
      resumeInterrupt: session.resumeInterrupt,
      resumeActiveRun: session.resumeActiveRun,
      threadId: session.activeThreadId,
      threadResetKey: session.threadResetKey,
      state: session.state,
      status: session.status,
      submitMessage: session.submitMessage,
    }),
    [
      configureHost,
      effectiveHostConfig,
      pendingUserText,
      pendingUserInsertIndex,
      session.activeThreadId,
      session.awaitingInterrupt,
      session.openInterruptFromStream,
      session.pendingInterruptToolCallIds,
      session.optimisticInterruptResults,
      session.respond,
      session.cancel,
      session.copilotMessages,
      session.error,
      session.events,
      session.messages,
      session.pendingSend,
      session.reset,
      session.resumeInterrupt,
      session.resumeActiveRun,
      session.threadResetKey,
      session.state,
      session.status,
      session.submitMessage,
    ]
  );

  const registeredHostKey = effectiveHostConfig.hostKey;
  // Host registration mirrors the in-tree AgentHostContext.Provider so
  // out-of-tree readers (`useAgentHost(hostKey)`) can subscribe. Runs
  // in an effect after commit — sibling-subtree consumers should normally
  // mount inside the EngentyAgent boundary instead of reaching across trees.
  useEffect(() => {
    ai.registerHost(host);
    return () => ai.unregisterHost(registeredHostKey, host);
  }, [ai, host, registeredHostKey]);

  return (
    <AgentHostContext.Provider value={host}>
      {props.children}
    </AgentHostContext.Provider>
  );
}

// Null-safe variant — returns null instead of throwing when outside an EngentyAgent boundary.
// Safe to call anywhere: always reads context in the same hook slot.
export function useOptionalAgentHost(): AgentHost | null {
  return useContext(AgentHostContext);
}

// Null-safe host resolution (in-tree context, then the registry by key). Returns
// null instead of throwing — safe for arbitrary consumers like useEngentyAgentState.
export function useOptionalAgentHostByKey(hostKey?: string): AgentHost | null {
  const nearestHost = useContext(AgentHostContext);
  const ai = useEngentyAIContext();

  // Only fall back to the registry when the React Context path can't satisfy
  // the lookup. Without this, in-tree consumers would re-render on every
  // registry notification because `useSyncExternalStore` is observed even
  // when its result isn't used.
  const useRegistry =
    !nearestHost || (Boolean(hostKey) && nearestHost.hostKey !== hostKey);
  const subscribeHostFn = ai.subscribeHost;
  const resolveHostFn = ai.resolveHost;
  const subscribeForKey = useCallback(
    (listener: () => void) => {
      if (!(useRegistry && hostKey)) {
        return () => {};
      }
      return subscribeHostFn(hostKey, listener);
    },
    [hostKey, subscribeHostFn, useRegistry]
  );
  const getSnapshotForKey = useCallback(
    () => (useRegistry && hostKey ? resolveHostFn(hostKey) : null),
    [hostKey, resolveHostFn, useRegistry]
  );
  const registeredHost = useSyncExternalStore(
    subscribeForKey,
    getSnapshotForKey,
    getSnapshotForKey
  );

  if (nearestHost && (!hostKey || nearestHost.hostKey === hostKey)) {
    return nearestHost;
  }
  if (hostKey && registeredHost) {
    return registeredHost;
  }
  return null;
}

export function useAgentHost(hostKey?: string): AgentHost {
  const host = useOptionalAgentHostByKey(hostKey);
  if (!host) {
    throw new Error("useAgentHost requires an EngentyAgent boundary.");
  }
  return host;
}

export function useAgentHostConfig(
  hostConfig: Partial<HostConfig> & { hostKey: string }
) {
  const host = useAgentHost(hostConfig.hostKey);
  const { threadId: _threadId, hostKey: _hostKey, ...childPatch } = hostConfig;

  // Layout effect so child patches (especially `initialMessages`) land in
  // the same commit as the host session hook's bound state — passive effects
  // ran too late and left session switches with a blank transcript until a
  // later frame.
  useLayoutEffect(() => {
    if (Object.keys(childPatch).length === 0) {
      return;
    }
    host.configureHost(childPatch);
  }, [
    host.configureHost,
    childPatch.agentId,
    childPatch.effort,
    childPatch.initialMessages,
    childPatch.messagesQueryKey,
    childPatch.modelId,
    childPatch.onMessagesSnapshot,
    childPatch.onThreadCreated,
    childPatch.openInterruptFromSession,
    childPatch.pathname,
    childPatch.routeContext,
    childPatch.threadDetailQueryKey,
    childPatch.threadsListQueryKey,
    childPatch.stableSessionKey,
    childPatch.hydrateEnabled,
  ]);

  return host;
}
