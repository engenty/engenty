import { describe, expect, it } from "vitest";
import {
  copilotRiverPath,
  copilotRiverPathForPathname,
  copilotRiverSubRunPath,
  isCopilotRiverPathname,
  readCopilotSubRunToolCallId,
} from "./copilot-river-paths.js";

describe("copilot river paths", () => {
  it("is one page outside a space and one inside each", () => {
    expect(copilotRiverPath()).toBe("/copilot");
    expect(copilotRiverPath(null)).toBe("/copilot");
    expect(copilotRiverPath("engrd")).toBe("/s/engrd/copilot");
    expect(copilotRiverPath("Sales / DACH")).toBe(
      "/s/Sales%20%2F%20DACH/copilot"
    );
  });

  it("stays in the space you are standing in", () => {
    expect(copilotRiverPathForPathname("/s/engrd/offers/ENG-041")).toBe(
      "/s/engrd/copilot"
    );
    expect(copilotRiverPathForPathname("/mdl/contacts")).toBe("/copilot");
  });

  it("carries a sub-run monitor as a query, never a path", () => {
    expect(copilotRiverSubRunPath("call-1")).toBe("/copilot?subRun=call-1");
    expect(copilotRiverSubRunPath("call-1", "engrd")).toBe(
      "/s/engrd/copilot?subRun=call-1"
    );
    expect(readCopilotSubRunToolCallId("?subRun=call-1")).toBe("call-1");
    expect(readCopilotSubRunToolCallId("subRun=%20")).toBeNull();
    expect(readCopilotSubRunToolCallId("")).toBeNull();
  });

  it("recognises the river page and nothing under it", () => {
    expect(isCopilotRiverPathname("/copilot")).toBe(true);
    expect(isCopilotRiverPathname("/s/engrd/copilot")).toBe(true);
    expect(isCopilotRiverPathname("/s/engrd/copilot/chat")).toBe(false);
    expect(isCopilotRiverPathname("/s/engrd")).toBe(false);
    expect(isCopilotRiverPathname("/mdl/engenty-copilot/chat")).toBe(false);
  });
});
