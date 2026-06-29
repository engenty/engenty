import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { useQueryClient } from "@engenty/query-client";
import type { PluginDiagnostic } from "@engenty/ui-plugin-sdk";
import { useEffect } from "react";
import { config } from "../lib/config";
import {
  consumePluginReloadUiRefresh,
  type ReloadUiRefreshMarker,
  type UiPluginContributionsQueryClient,
} from "./ui-plugin-contributions-queries";

interface DevPluginReloadStepDiagnostic {
  diagnostics?: PluginDiagnostic[];
  generationId?: number;
  key: string;
  message: string;
  nextGenerationId?: number;
  status: "blocked" | "failed" | "skipped" | "succeeded";
}

interface DevPluginReloadBrowserEvent {
  generationId?: number;
  issues?: PluginDiagnostic[];
  pluginId: string;
  status: "blocked" | "failed" | "reloaded";
  steps?: DevPluginReloadStepDiagnostic[];
  type: "plugin_reload";
  uiRefresh?: ReloadUiRefreshMarker;
}

type DevPluginReloadQueryClient = UiPluginContributionsQueryClient & {
  setQueryData?: (
    queryKey: readonly unknown[],
    data: DevPluginReloadBrowserEvent
  ) => unknown;
};

interface EventSourceLike {
  addEventListener: (
    type: string,
    listener: (event: MessageEvent<string>) => void
  ) => void;
  close: () => void;
}

type EventSourceConstructor = new (url: string) => EventSourceLike;

const activeSubscriptions = new WeakMap<
  DevPluginReloadQueryClient,
  { refs: number; unsubscribe: () => void }
>();

export const devPluginReloadEventsKeys = {
  latest: ["dev-plugin-reload-events", "latest"] as const,
};

function getWindowEventSource(): EventSourceConstructor | undefined {
  if (typeof window === "undefined") {
    return;
  }
  return window.EventSource;
}

export function devPluginReloadEventsUrl(baseUrl = config.apiBaseUrl): string {
  const path = "/api/plugins/dev-reload-events";
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return normalizedBase ? `${normalizedBase}${path}` : path;
}

export function shouldSubscribeToDevPluginReloadEvents() {
  return import.meta.env.DEV && isEngentyDevelopmentEnvironment();
}

export function subscribeToDevPluginReloadEvents(params: {
  enabled?: boolean;
  EventSourceCtor?: EventSourceConstructor;
  queryClient: DevPluginReloadQueryClient;
}) {
  const enabled = params.enabled ?? shouldSubscribeToDevPluginReloadEvents();
  if (!enabled) {
    return;
  }
  const EventSourceCtor = params.EventSourceCtor ?? getWindowEventSource();
  if (!EventSourceCtor) {
    return;
  }

  const source = new EventSourceCtor(devPluginReloadEventsUrl());
  source.addEventListener("plugin-reload", (event) => {
    const parsed = JSON.parse(event.data) as DevPluginReloadBrowserEvent;
    if (parsed.type !== "plugin_reload") {
      return;
    }
    params.queryClient.setQueryData?.(devPluginReloadEventsKeys.latest, parsed);
    void params.queryClient.invalidateQueries({ queryKey: ["plugins"] });
    consumePluginReloadUiRefresh(params.queryClient, {
      uiRefresh: parsed.uiRefresh,
    });
  });
  return () => {
    source.close();
  };
}

export function retainDevPluginReloadEventsSubscription(params: {
  enabled?: boolean;
  EventSourceCtor?: EventSourceConstructor;
  queryClient: DevPluginReloadQueryClient;
}) {
  const enabled = params.enabled ?? shouldSubscribeToDevPluginReloadEvents();
  if (!enabled) {
    return;
  }

  const active = activeSubscriptions.get(params.queryClient);
  if (active) {
    active.refs += 1;
    return () => {
      active.refs -= 1;
      if (active.refs === 0) {
        active.unsubscribe();
        activeSubscriptions.delete(params.queryClient);
      }
    };
  }

  const unsubscribe = subscribeToDevPluginReloadEvents(params);
  if (!unsubscribe) {
    return;
  }
  activeSubscriptions.set(params.queryClient, { refs: 1, unsubscribe });
  return () => {
    const current = activeSubscriptions.get(params.queryClient);
    if (!current) {
      return;
    }
    current.refs -= 1;
    if (current.refs === 0) {
      current.unsubscribe();
      activeSubscriptions.delete(params.queryClient);
    }
  };
}

export function useDevPluginReloadEventsSubscription() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      retainDevPluginReloadEventsSubscription({
        queryClient,
      }),
    [queryClient]
  );
}
