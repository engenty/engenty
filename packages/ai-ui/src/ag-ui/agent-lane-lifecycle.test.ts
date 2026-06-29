import { describe, expect, it } from "vitest";
import {
  deriveAgentLaneLifecycle,
  isAgentLaneLifecycleActive,
} from "./agent-lane-lifecycle.js";

describe("deriveAgentLaneLifecycle", () => {
  it("maps awaiting interrupt to needs approval", () => {
    expect(
      deriveAgentLaneLifecycle({
        awaitingInterrupt: true,
        chatStatus: "ready",
        hasMessages: true,
      })
    ).toBe("needs_approval");
  });

  it("maps transport state during startup gaps", () => {
    expect(
      deriveAgentLaneLifecycle({
        chatStatus: "submitted",
        hasMessages: false,
      })
    ).toBe("starting");
    expect(
      deriveAgentLaneLifecycle({
        chatStatus: "streaming",
        hasMessages: false,
      })
    ).toBe("running");
    expect(isAgentLaneLifecycleActive("running")).toBe(true);
  });

  it("maps ready with transcript to completed ready", () => {
    expect(
      deriveAgentLaneLifecycle({
        chatStatus: "ready",
        hasMessages: true,
      })
    ).toBe("completed_ready");
    expect(isAgentLaneLifecycleActive("completed_ready")).toBe(false);
  });

  it("maps ready without transcript to idle", () => {
    expect(
      deriveAgentLaneLifecycle({
        chatStatus: "ready",
        hasMessages: false,
      })
    ).toBe("idle");
  });

  it("maps transport error to failed", () => {
    expect(
      deriveAgentLaneLifecycle({
        chatStatus: "error",
        hasMessages: false,
      })
    ).toBe("failed");
  });
});
