import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/config", () => ({
  config: {
    apiBaseUrl: "http://127.0.0.1:8787",
  },
}));

import {
  devPluginReloadEventsKeys,
  devPluginReloadEventsUrl,
  retainDevPluginReloadEventsSubscription,
  subscribeToDevPluginReloadEvents,
} from "./dev-plugin-reload-events";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private readonly listeners = new Map<
    string,
    (event: MessageEvent<string>) => void
  >();
  close = vi.fn();
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void
  ) {
    this.listeners.set(type, listener);
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({
      data: JSON.stringify(data),
    } as MessageEvent<string>);
  }
}

describe("dev plugin reload browser subscription", () => {
  it("builds the dev reload event stream URL from the API base URL", () => {
    expect(devPluginReloadEventsUrl()).toBe(
      "http://127.0.0.1:8787/api/plugins/dev-reload-events"
    );
    expect(devPluginReloadEventsUrl("")).toBe("/api/plugins/dev-reload-events");
  });

  it("invalidates UI contributions when a reload marker arrives", async () => {
    FakeEventSource.instances = [];
    const queryClient = {
      invalidateQueries: vi.fn(async () => undefined),
      setQueryData: vi.fn(),
    };

    const unsubscribe = subscribeToDevPluginReloadEvents({
      enabled: true,
      EventSourceCtor: FakeEventSource,
      queryClient,
    });

    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0].emit("plugin-reload", {
      pluginId: "contacts",
      status: "reloaded",
      type: "plugin_reload",
      uiRefresh: {
        generationId: 9,
        invalidationRequired: true,
        pluginId: "contacts",
        reason: "ui_contributions_may_have_changed",
      },
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      devPluginReloadEventsKeys.latest,
      expect.objectContaining({
        pluginId: "contacts",
        status: "reloaded",
      })
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["plugins"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["ui-plugin-contributions"],
    });
    unsubscribe?.();
    expect(FakeEventSource.instances[0].close).toHaveBeenCalled();
  });

  it("keeps plugin diagnostics fresh for reload events without UI refresh", () => {
    FakeEventSource.instances = [];
    const queryClient = {
      invalidateQueries: vi.fn(async () => undefined),
      setQueryData: vi.fn(),
    };

    subscribeToDevPluginReloadEvents({
      enabled: true,
      EventSourceCtor: FakeEventSource,
      queryClient,
    });

    FakeEventSource.instances[0].emit("plugin-reload", {
      issues: [
        {
          code: "plugin.reload.blocked",
          level: "error",
          message: "Reload blocked.",
          pluginId: "contacts",
        },
      ],
      pluginId: "contacts",
      status: "blocked",
      steps: [],
      type: "plugin_reload",
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      devPluginReloadEventsKeys.latest,
      expect.objectContaining({
        pluginId: "contacts",
        status: "blocked",
      })
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["plugins"],
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["ui-plugin-contributions"],
    });
  });

  it("does not open an event stream when disabled", () => {
    FakeEventSource.instances = [];

    subscribeToDevPluginReloadEvents({
      enabled: false,
      EventSourceCtor: FakeEventSource,
      queryClient: { invalidateQueries: vi.fn() },
    });

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("shares one event stream per query client across mounted consumers", () => {
    FakeEventSource.instances = [];
    const queryClient = { invalidateQueries: vi.fn() };

    const releaseOne = retainDevPluginReloadEventsSubscription({
      enabled: true,
      EventSourceCtor: FakeEventSource,
      queryClient,
    });
    const releaseTwo = retainDevPluginReloadEventsSubscription({
      enabled: true,
      EventSourceCtor: FakeEventSource,
      queryClient,
    });

    expect(FakeEventSource.instances).toHaveLength(1);
    releaseOne?.();
    expect(FakeEventSource.instances[0].close).not.toHaveBeenCalled();
    releaseTwo?.();
    expect(FakeEventSource.instances[0].close).toHaveBeenCalled();
  });
});
