import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { type BridgeDeps, runInboundSync } from "./bridge.js";

const CONV = {
  external: { slack: { channel_id: "C1", connection_id: "conn-1" } },
  id: "conv-1",
  scope_id: "default",
  tenant_id: "tenant-1",
  type: "public_channel",
};

/**
 * Minimal Supabase stub: only the query shapes runInboundSync reaches before
 * the autonomous-mode gate — listBoundConversations' conversations select.
 * A thenable chain returns the one bound conversation for any select.
 */
function fakeSupabase(): SupabaseClient {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "schema",
    "from",
    "select",
    "not",
    "eq",
    "in",
    "update",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  // Awaiting the chain (after select/not/eq) yields the bound conversation.
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [CONV], error: null });
  return chain as unknown as SupabaseClient;
}

function deps(overrides: Partial<BridgeDeps> = {}): BridgeDeps {
  return {
    connections: {
      callAction: vi.fn(async () => ({ messages: [] })),
      listConnections: vi.fn(async () => [
        { autonomous_mode: "off", id: "conn-1" },
      ]),
    },
    postImported: vi.fn(async () => ({ ts: "1.1" })),
    supabase: fakeSupabase(),
    ...overrides,
  };
}

describe("runInboundSync", () => {
  it("skips (not errors) a conversation whose connection is not autonomous", async () => {
    const d = deps();
    const summary = await runInboundSync(d);
    expect(summary).toMatchObject({
      conversations: 1,
      errors: 0,
      imported: 0,
      skipped: 1,
    });
    // Never calls the Slack API for a skipped connection.
    expect(d.connections.callAction).not.toHaveBeenCalled();
  });

  it("reads history when the connection is in full autonomous mode", async () => {
    const callAction = vi.fn(async () => ({ messages: [] }));
    const d = deps({
      connections: {
        callAction,
        listConnections: vi.fn(async () => [
          { autonomous_mode: "full", id: "conn-1" },
        ]),
      },
    });
    const summary = await runInboundSync(d);
    expect(summary).toMatchObject({ errors: 0, imported: 0, skipped: 0 });
    expect(callAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: "get_channel_history" })
    );
  });
});
