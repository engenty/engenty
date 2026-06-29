import { describe, expect, it } from "vitest";
import { sessionMatchesHostKey } from "./thread-host-key.js";

describe("sessionMatchesHostKey", () => {
  it("matches explicit host_key", () => {
    expect(
      sessionMatchesHostKey({
        agentId: "engenty.copilot",
        hostKey: "engenty:copilot",
        routeContext: { host_key: "engenty:copilot" },
      })
    ).toBe(true);
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
