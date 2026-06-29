import { describe, expect, it } from "vitest";
import { deterministicOrchestratorThreadId } from "../deterministic-thread-id.js";

describe("deterministicOrchestratorThreadId", () => {
  it("returns the same UUID for the same inputs", () => {
    const a = deterministicOrchestratorThreadId({
      tenant_id: "t1",
      scope: "u1",
      stable_key: "copilot-thread-1",
    });
    const b = deterministicOrchestratorThreadId({
      tenant_id: "t1",
      scope: "u1",
      stable_key: "copilot-thread-1",
    });
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("differs when any input differs", () => {
    const base = deterministicOrchestratorThreadId({
      tenant_id: "t1",
      scope: "u1",
      stable_key: "k",
    });
    expect(
      deterministicOrchestratorThreadId({
        tenant_id: "t2",
        scope: "u1",
        stable_key: "k",
      })
    ).not.toBe(base);
    expect(
      deterministicOrchestratorThreadId({
        tenant_id: "t1",
        scope: "u2",
        stable_key: "k",
      })
    ).not.toBe(base);
    expect(
      deterministicOrchestratorThreadId({
        tenant_id: "t1",
        scope: "u1",
        stable_key: "k2",
      })
    ).not.toBe(base);
  });
});
