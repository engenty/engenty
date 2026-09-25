import { describe, expect, it } from "vitest";

import { resolveRunBrowser } from "../run-browser.js";

const SPACE_ID = "00000000-0000-4000-8000-0000000000bb";

describe("resolveRunBrowser", () => {
  it("gives a run with no Space no browser", () => {
    expect(
      resolveRunBrowser({ agentId: "agent-a", source: { kind: "global" } })
    ).toBeNull();
    expect(
      resolveRunBrowser({ agentId: "agent-a", source: { kind: "unresolved" } })
    ).toBeNull();
  });

  it("gives a run that names no agent no window", () => {
    const source = {
      kind: "resolved" as const,
      space: {
        browser: { autostart: true, unattended: true },
        spaceId: SPACE_ID,
      },
    };
    expect(resolveRunBrowser({ agentId: null, source })).toBeNull();
    expect(resolveRunBrowser({ agentId: "  ", source })).toBeNull();
  });

  it("carries the Space's grant into the agent's window", () => {
    expect(
      resolveRunBrowser({
        agentId: " agent-a ",
        source: {
          kind: "resolved",
          space: {
            browser: { autostart: true, unattended: true },
            spaceId: SPACE_ID,
          },
        },
      })
    ).toEqual({
      agentId: "agent-a",
      autostart: true,
      spaceId: SPACE_ID,
      unattended: true,
    });
  });

  it("grants nothing when the Space has no browser grant", () => {
    expect(
      resolveRunBrowser({
        agentId: "agent-a",
        source: {
          kind: "resolved",
          space: { browser: null, spaceId: SPACE_ID },
        },
      })
    ).toEqual({
      agentId: "agent-a",
      autostart: false,
      spaceId: SPACE_ID,
      unattended: false,
    });
  });
});
