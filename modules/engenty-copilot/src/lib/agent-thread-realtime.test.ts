import { describe, expect, it, vi } from "vitest";
import {
  type AgentThreadRealtimeChannel,
  type AgentThreadRealtimePayload,
  createAgentThreadRealtimeSubscription,
} from "./agent-thread-realtime.js";

function createRealtimeChannel() {
  let callback: ((payload: AgentThreadRealtimePayload) => void) | null = null;
  const unsubscribe = vi.fn();
  const channel: AgentThreadRealtimeChannel = {
    on: vi.fn((event, _config, nextCallback) => {
      // A "system" error listener is also registered; only capture the
      // postgres_changes handler here.
      if (event === "postgres_changes") {
        callback = nextCallback as (
          payload: AgentThreadRealtimePayload
        ) => void;
      }
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    unsubscribe,
  };
  return {
    channel,
    emit: (payload: AgentThreadRealtimePayload) => callback?.(payload),
    unsubscribe,
  };
}

describe("createAgentThreadRealtimeSubscription", () => {
  it("does not subscribe when realtime is unavailable", () => {
    const onThreadChange = vi.fn();

    const subscription = createAgentThreadRealtimeSubscription({
      client: null,
      onThreadChange,
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(subscription).toBeNull();
    expect(onThreadChange).not.toHaveBeenCalled();
  });

  it("subscribes to tenant-scoped agent thread changes", () => {
    const realtime = createRealtimeChannel();
    const client = {
      channel: vi.fn(() => realtime.channel),
    };

    createAgentThreadRealtimeSubscription({
      client,
      onThreadChange: vi.fn(),
      tenantId: "tenant-1",
      userId: "user-1",
    });

    // live-cache appends a per-subscription "#<n>" so a second subscriber
    // cannot adopt this joined channel; the caller's name is the prefix.
    expect(client.channel).toHaveBeenCalledWith(
      expect.stringMatching(/^copilot-agent-threads:tenant-1:user-1#\d+$/)
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

  it("notifies with the changed thread id", () => {
    const realtime = createRealtimeChannel();
    const onThreadChange = vi.fn();

    createAgentThreadRealtimeSubscription({
      client: {
        channel: vi.fn(() => realtime.channel),
      },
      onThreadChange,
      tenantId: "tenant-1",
      userId: "user-1",
    });

    realtime.emit({ eventType: "UPDATE", new: { id: "thread-1" } });

    expect(onThreadChange).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("removes the channel when unsubscribing", () => {
    const realtime = createRealtimeChannel();
    const removeChannel = vi.fn();
    const subscription = createAgentThreadRealtimeSubscription({
      client: {
        channel: vi.fn(() => realtime.channel),
        removeChannel,
      },
      onThreadChange: vi.fn(),
      tenantId: "tenant-1",
      userId: "user-1",
    });

    subscription?.unsubscribe();

    expect(removeChannel).toHaveBeenCalledWith(realtime.channel);
    expect(realtime.unsubscribe).not.toHaveBeenCalled();
  });
});
