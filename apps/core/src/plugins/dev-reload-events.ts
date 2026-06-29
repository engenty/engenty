import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { envBoolean } from "@engenty/environment/env";
import type {
  ReloadPluginExecutionResult,
  ReloadPluginUiRefresh,
} from "./reload-executor.js";

export interface DevPluginReloadBrowserEvent {
  generationId?: number;
  issues: ReloadPluginExecutionResult["issues"];
  pluginId: string;
  status: ReloadPluginExecutionResult["status"];
  steps: ReloadPluginExecutionResult["steps"];
  type: "plugin_reload";
  uiRefresh?: ReloadPluginUiRefresh;
}

export type DevPluginReloadEventListener = (
  event: DevPluginReloadBrowserEvent
) => void;

export interface DevPluginReloadEventHub {
  publish: (event: DevPluginReloadBrowserEvent) => void;
  publishReloadResult: (result: ReloadPluginExecutionResult) => void;
  subscribe: (listener: DevPluginReloadEventListener) => () => void;
}

export function shouldEnableDevPluginReloadBrowserEvents(
  config: Record<string, unknown> = {}
): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (
    !envBoolean(
      config,
      "devPluginReloadBrowserEventsEnabled",
      "ENGENTY_DEV_PLUGIN_RELOAD_BROWSER_EVENTS",
      true
    )
  ) {
    return false;
  }
  return isEngentyDevelopmentEnvironment();
}

export function reloadResultToDevPluginReloadBrowserEvent(
  result: ReloadPluginExecutionResult
): DevPluginReloadBrowserEvent | undefined {
  return {
    generationId: result.generationId,
    issues: result.issues,
    pluginId: result.pluginId,
    steps: result.steps,
    status: result.status,
    type: "plugin_reload",
    uiRefresh: result.uiRefresh,
  };
}

export function createDevPluginReloadEventHub(): DevPluginReloadEventHub {
  const listeners = new Set<DevPluginReloadEventListener>();
  const publish = (event: DevPluginReloadBrowserEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    publish,
    publishReloadResult: (result) => {
      const event = reloadResultToDevPluginReloadBrowserEvent(result);
      if (event) {
        publish(event);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function encodeDevPluginReloadSseEvent(
  event: DevPluginReloadBrowserEvent
): string {
  return `event: plugin-reload\ndata: ${JSON.stringify(event)}\n\n`;
}
