import { describe, expect, it } from "vitest";
import {
  effectiveApprovalMode,
  parseAgentApprovalMode,
  shouldAskHuman,
} from "./agent-approval-mode.js";

describe("parseAgentApprovalMode", () => {
  it("accepts the three modes and rejects everything else", () => {
    expect(parseAgentApprovalMode("manual")).toBe("manual");
    expect(parseAgentApprovalMode("auto")).toBe("auto");
    expect(parseAgentApprovalMode("pass-all")).toBe("pass-all");
    expect(parseAgentApprovalMode("yolo")).toBeNull();
    expect(parseAgentApprovalMode(null)).toBeNull();
  });
});

describe("effectiveApprovalMode", () => {
  it("defaults to manual when nothing is set", () => {
    expect(effectiveApprovalMode([])).toBe("manual");
    expect(effectiveApprovalMode([null, undefined])).toBe("manual");
  });

  it("takes the most restrictive set layer", () => {
    expect(effectiveApprovalMode(["manual", "pass-all"])).toBe("manual");
    expect(effectiveApprovalMode(["auto", "pass-all"])).toBe("auto");
    expect(effectiveApprovalMode(["pass-all", "auto", "manual"])).toBe(
      "manual"
    );
    expect(effectiveApprovalMode(["pass-all"])).toBe("pass-all");
  });
});

describe("shouldAskHuman", () => {
  it("pass-all never asks once the agent is capable", () => {
    expect(
      shouldAskHuman({
        mode: "pass-all",
        requiresApproval: true,
        riskLevel: "critical",
        spaceWriteMounted: false,
      })
    ).toBe(false);
  });

  it("manual asks on requiresApproval or high/critical", () => {
    expect(
      shouldAskHuman({
        mode: "manual",
        requiresApproval: false,
        riskLevel: "low",
        spaceWriteMounted: false,
      })
    ).toBe(false);
    expect(
      shouldAskHuman({
        mode: "manual",
        requiresApproval: true,
        riskLevel: "low",
        spaceWriteMounted: false,
      })
    ).toBe(true);
    expect(
      shouldAskHuman({
        mode: "manual",
        requiresApproval: false,
        riskLevel: "high",
        spaceWriteMounted: false,
      })
    ).toBe(true);
  });

  it("auto passes low, asks high, and passes medium reads or space writes", () => {
    expect(
      shouldAskHuman({
        mode: "auto",
        requiresApproval: true,
        riskLevel: "low",
        spaceWriteMounted: false,
      })
    ).toBe(false);
    expect(
      shouldAskHuman({
        mode: "auto",
        requiresApproval: false,
        riskLevel: "medium",
        spaceWriteMounted: false,
      })
    ).toBe(false);
    expect(
      shouldAskHuman({
        mode: "auto",
        requiresApproval: true,
        riskLevel: "medium",
        spaceWriteMounted: true,
      })
    ).toBe(false);
    expect(
      shouldAskHuman({
        mode: "auto",
        requiresApproval: true,
        riskLevel: "medium",
        spaceWriteMounted: false,
      })
    ).toBe(true);
    expect(
      shouldAskHuman({
        mode: "auto",
        requiresApproval: false,
        riskLevel: "critical",
        spaceWriteMounted: true,
      })
    ).toBe(true);
  });
});
