import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createBrowserBridgeRepo } from "./repo.js";

/**
 * Minimal chainable query builder standing in for a supabase-js table query.
 * Records every method call and resolves to a canned result, so tests can
 * assert the claim/complete state-machine guards without a database.
 */
interface RecordedCall {
  args: unknown[];
  method: string;
}

interface BuilderResult {
  data: unknown;
  error: { message: string } | null;
}

function createBuilder(result: BuilderResult) {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = { calls };
  for (const method of [
    "delete",
    "eq",
    "gt",
    "in",
    "insert",
    "limit",
    "order",
    "select",
    "update",
    "upsert",
  ]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ args, method });
      return builder;
    });
  }
  // biome-ignore lint/suspicious/noThenProperty: mimics supabase-js's thenable query builder
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder as unknown as {
    calls: RecordedCall[];
  } & Record<string, ReturnType<typeof vi.fn>>;
}

function createSupabase(result: BuilderResult) {
  const builder = createBuilder(result);
  const from = vi.fn(() => builder);
  const supabase = {
    schema: vi.fn(() => ({ from })),
  } as unknown as SupabaseClient;
  return { builder, from, supabase };
}

function callsOf(builder: { calls: RecordedCall[] }, method: string) {
  return builder.calls.filter((c) => c.method === method);
}

describe("browser-bridge repo request state machine", () => {
  it("claimPendingRequests flips pending → claimed for live requests only", async () => {
    const rows = [
      { created_at: "2026-07-12T10:00:02Z", id: "b" },
      { created_at: "2026-07-12T10:00:01Z", id: "a" },
    ];
    const { builder, supabase } = createSupabase({ data: rows, error: null });
    const repo = createBrowserBridgeRepo(supabase);

    const claimed = await repo.claimPendingRequests("inst-1");

    expect(callsOf(builder, "update")[0]?.args[0]).toEqual({
      status: "claimed",
    });
    const eqCalls = callsOf(builder, "eq").map((c) => c.args);
    expect(eqCalls).toContainEqual(["installation_id", "inst-1"]);
    expect(eqCalls).toContainEqual(["status", "pending"]);
    expect(callsOf(builder, "gt")[0]?.args[0]).toBe("expires_at");
    // Returned oldest-first regardless of DB ordering.
    expect(claimed.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("completeRequest only resolves rows still in claimed state", async () => {
    const { builder, supabase } = createSupabase({ data: null, error: null });
    const repo = createBrowserBridgeRepo(supabase);

    await repo.completeRequest({ id: "req-1", ok: true, response: { x: 1 } });

    expect(callsOf(builder, "update")[0]?.args[0]).toMatchObject({
      response: { x: 1 },
      status: "completed",
    });
    const eqCalls = callsOf(builder, "eq").map((c) => c.args);
    expect(eqCalls).toContainEqual(["id", "req-1"]);
    expect(eqCalls).toContainEqual(["status", "claimed"]);
  });

  it("completeRequest records error text and code on failure", async () => {
    const { builder, supabase } = createSupabase({ data: null, error: null });
    const repo = createBrowserBridgeRepo(supabase);

    await repo.completeRequest({
      errorCode: "browser_bridge_ref_stale",
      errorText: "stale snapshot",
      id: "req-1",
      ok: false,
    });

    expect(callsOf(builder, "update")[0]?.args[0]).toMatchObject({
      error: "stale snapshot",
      error_code: "browser_bridge_ref_stale",
      response: null,
      status: "error",
    });
  });

  it("expireRequest expires both never-claimed and claimed-but-lost rows", async () => {
    const { builder, supabase } = createSupabase({ data: null, error: null });
    const repo = createBrowserBridgeRepo(supabase);

    await repo.expireRequest("req-1");

    expect(callsOf(builder, "update")[0]?.args[0]).toEqual({
      status: "expired",
    });
    expect(callsOf(builder, "in")[0]?.args).toEqual([
      "status",
      ["pending", "claimed"],
    ]);
  });

  it("surfaces supabase errors with module context", async () => {
    const { supabase } = createSupabase({
      data: null,
      error: { message: "boom" },
    });
    const repo = createBrowserBridgeRepo(supabase);

    await expect(repo.expireRequest("req-1")).rejects.toThrow(
      /browser-bridge repo: boom/
    );
  });
});
