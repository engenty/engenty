import { describe, expect, it, vi } from "vitest";
import {
  type AgentSessionRealtimeChannel,
  type AgentSessionRealtimePayload,
  createAgentSessionRealtimeSubscription,
} from "./agent-session-realtime.js";

function createRealtimeChannel() {
  let callback: ((payload: AgentSessionRealtimePayload) => void) | null = null;
  const unsubscribe = vi.fn();
  const channel: AgentSessionRealtimeChannel = {
    on: vi.fn((_event, _config, nextCallback) => {
      callback = nextCallback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    unsubscribe,
  };
  return {
    channel,
    emit: (payload: AgentSessionRealtimePayload) => callback?.(payload),
    unsubscribe,
  };
}

describe("createAgentSessionRealtimeSubscription", () => {
  it("does not subscribe when realtime is unavailable", () => {
    const onSessionChange = vi.fn();

    const subscription = createAgentSessionRealtimeSubscription({
      client: null,
      onSessionChange,
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(subscription).toBeNull();
    expect(onSessionChange).not.toHaveBeenCalled();
  });

  it("subscribes to tenant-scoped agent session changes", () => {
    const realtime = createRealtimeChannel();
    const client = {
      channel: vi.fn(() => realtime.channel),
    };

    createAgentSessionRealtimeSubscription({
      client,
      onSessionChange: vi.fn(),
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(client.channel).toHaveBeenCalledWith(
      "copilot-agent-sessions:tenant-1:user-1"
    );
    expect(realtime.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        filter: "tenant_id=eq.tenant-1",
        schema: "ai",
        table: "thread",
      },
      expect.any(Function)
    );
    expect(realtime.channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it("notifies with the changed session id", () => {
    const realtime = createRealtimeChannel();
    const onSessionChange = vi.fn();

    createAgentSessionRealtimeSubscription({
      client: {
        channel: vi.fn(() => realtime.channel),
      },
      onSessionChange,
      tenantId: "tenant-1",
      userId: "user-1",
    });

    realtime.emit({ eventType: "UPDATE", new: { id: "session-1" } });

    expect(onSessionChange).toHaveBeenCalledWith({ threadId: "session-1" });
  });

  it("removes the channel when unsubscribing", () => {
    const realtime = createRealtimeChannel();
    const removeChannel = vi.fn();
    const subscription = createAgentSessionRealtimeSubscription({
      client: {
        channel: vi.fn(() => realtime.channel),
        removeChannel,
      },
      onSessionChange: vi.fn(),
      tenantId: "tenant-1",
      userId: "user-1",
    });

    subscription?.unsubscribe();

    expect(removeChannel).toHaveBeenCalledWith(realtime.channel);
    expect(realtime.unsubscribe).not.toHaveBeenCalled();
  });
});
