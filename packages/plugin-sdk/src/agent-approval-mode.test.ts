import { describe, expect, it } from "vitest";
import {
  parseAgentApprovalMode,
  resolveAgentApprovalMode,
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

describe("resolveAgentApprovalMode", () => {
  const none = { agentMode: null, spaceMode: null, tenantMode: null };

  it("defaults to auto when nothing is set", () => {
    expect(resolveAgentApprovalMode(none)).toBe("auto");
  });

  it("inherits space over tenant", () => {
    expect(
      resolveAgentApprovalMode({
        ...none,
        spaceMode: "auto",
        tenantMode: "manual",
      })
    ).toBe("auto");
    expect(resolveAgentApprovalMode({ ...none, tenantMode: "pass-all" })).toBe(
      "pass-all"
    );
  });

  it("lets the agent's own mode decide, looser or stricter", () => {
    expect(
      resolveAgentApprovalMode({
        ...none,
        agentMode: "auto",
        spaceMode: "manual",
      })
    ).toBe("auto");
    expect(
      resolveAgentApprovalMode({
        ...none,
        agentMode: "manual",
        spaceMode: "pass-all",
      })
    ).toBe("manual");
  });

  it("gives the copilot auto until someone sets its mode", () => {
    expect(
      resolveAgentApprovalMode({
        ...none,
        agentKey: "engenty.copilot",
        tenantMode: "manual",
      })
    ).toBe("auto");
    expect(
      resolveAgentApprovalMode({
        ...none,
        agentKey: "engenty.copilot",
        agentMode: "manual",
      })
    ).toBe("manual");
    expect(
      resolveAgentApprovalMode({
        ...none,
        agentKey: "engrd.chief-of-staff",
        tenantMode: "manual",
      })
    ).toBe("manual");
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
