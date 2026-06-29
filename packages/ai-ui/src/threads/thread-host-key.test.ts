import { describe, expect, it } from "vitest";
import {
  mergeRouteContextWithHostKey,
  sessionMatchesHostKey,
} from "./thread-host-key.js";

describe("thread-host-key", () => {
  it("merges host_key into route_context", () => {
    expect(
      mergeRouteContextWithHostKey({ moduleId: "copilot" }, "engenty:copilot")
    ).toEqual({
      moduleId: "copilot",
      host_key: "engenty:copilot",
    });
  });

  it("rejects rows without host_key", () => {
    expect(
      sessionMatchesHostKey({
        agentId: "engenty.copilot",
        hostKey: "engenty:copilot",
        routeContext: {},
      })
    ).toBe(false);
  });

  it("rejects rows for a different host_key", () => {
    expect(
      sessionMatchesHostKey({
        agentId: "engenty.copilot",
        hostKey: "engenty:copilot",
        routeContext: { host_key: "kb:search" },
      })
    ).toBe(false);
  });
});
