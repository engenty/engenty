import { shouldAskHuman } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import {
  resolveEffectiveAgentApprovalMode,
  resolveTaskCompletionPolicy,
  type TaskCompletionPolicyDeps,
  taskRunGatingPolicy,
} from "../task-completion-policy.js";

function deps(
  over: Partial<TaskCompletionPolicyDeps>
): TaskCompletionPolicyDeps {
  return {
    loadSpaceMode: () => Promise.resolve(null),
    loadTenantPrefs: () => Promise.resolve(null),
    ...over,
  };
}

const input = {
  agentTypeKey: "knowledge-base.manager",
  spaceId: "0198c0de-0000-7000-8000-000000000001",
  tenantId: "0198c0de-0000-7000-8000-000000000002",
};

describe("resolveTaskCompletionPolicy", () => {
  it("defaults to review when nothing is configured", async () => {
    expect(await resolveTaskCompletionPolicy(deps({}), input)).toBe("review");
  });

  it("auto space mode completes without review", async () => {
    const policy = await resolveTaskCompletionPolicy(
      deps({
        loadSpaceMode: () => Promise.resolve("auto"),
        loadTenantPrefs: () => Promise.resolve({ mode: "auto" }),
      }),
      input
    );
    expect(policy).toBe("complete");
  });

  it("a set space mode replaces the tenant mode: manual space beats auto tenant", async () => {
    const policy = await resolveTaskCompletionPolicy(
      deps({
        loadSpaceMode: () => Promise.resolve("manual"),
        loadTenantPrefs: () => Promise.resolve({ mode: "auto" }),
      }),
      input
    );
    expect(policy).toBe("review");
  });

  it("a space can loosen past the tenant default", async () => {
    const policy = await resolveTaskCompletionPolicy(
      deps({
        loadSpaceMode: () => Promise.resolve("pass-all"),
        loadTenantPrefs: () => Promise.resolve({ mode: "manual" }),
      }),
      input
    );
    expect(policy).toBe("complete");
  });

  it("a manual per-agent override beats a pass-all tenant", async () => {
    const policy = await resolveTaskCompletionPolicy(
      deps({
        loadTenantPrefs: () =>
          Promise.resolve({
            agents: { "knowledge-base.manager": "manual" },
            mode: "pass-all",
          }),
      }),
      input
    );
    expect(policy).toBe("review");
  });

  it("tenant auto alone is enough (unset space inherits)", async () => {
    const policy = await resolveTaskCompletionPolicy(
      deps({ loadTenantPrefs: () => Promise.resolve({ mode: "pass-all" }) }),
      input
    );
    expect(policy).toBe("complete");
  });

  it("fails soft to review when a layer read throws", async () => {
    const policy = await resolveTaskCompletionPolicy(
      deps({
        loadSpaceMode: () => Promise.reject(new Error("boom")),
        loadTenantPrefs: () => Promise.resolve({ mode: "auto" }),
      }),
      input
    );
    // Space read failed → layer treated as unset; tenant auto still applies.
    expect(policy).toBe("complete");
  });

  it("the agent's own mode decides, also looser than the tenant default", async () => {
    // Tenant unset = default manual; the mode is bound to the agent.
    const policy = await resolveTaskCompletionPolicy(
      deps({
        loadTenantPrefs: () =>
          Promise.resolve({ agents: { "custom.researcher": "pass-all" } }),
      }),
      { ...input, agentTypeKey: "custom.researcher" }
    );
    expect(policy).toBe("complete");
  });
});

describe("resolveEffectiveAgentApprovalMode", () => {
  it("the agent layer wins over the tenant mode", async () => {
    const mode = await resolveEffectiveAgentApprovalMode(
      deps({
        loadTenantPrefs: () =>
          Promise.resolve({
            agents: { "custom.researcher": "auto" },
            mode: "pass-all",
          }),
      }),
      { ...input, agentTypeKey: "custom.researcher" }
    );
    expect(mode).toBe("auto");
  });

  it("an unparseable agent layer is treated as unset", async () => {
    const mode = await resolveEffectiveAgentApprovalMode(
      deps({
        loadTenantPrefs: () =>
          Promise.resolve({
            agents: { "custom.researcher": "definitely-not-a-mode" },
            mode: "auto",
          }),
      }),
      { ...input, agentTypeKey: "custom.researcher" }
    );
    expect(mode).toBe("auto");
  });

  it("fails soft to manual when everything throws", async () => {
    const mode = await resolveEffectiveAgentApprovalMode(
      {
        loadSpaceMode: () => {
          throw new Error("boom");
        },
        loadTenantPrefs: () => {
          throw new Error("boom");
        },
      },
      input
    );
    expect(mode).toBe("manual");
  });
});

describe("taskRunGatingPolicy (mode → tool-gating policy)", () => {
  it("manual keeps the pre-gate: a medium-risk gated op parks the run", () => {
    expect(taskRunGatingPolicy("manual")).toBe("request");
  });

  it("auto defers to core: medium-risk writes are core's call", () => {
    expect(taskRunGatingPolicy("auto")).toBe("defer");
  });

  it("pass-all also defers to core", () => {
    expect(taskRunGatingPolicy("pass-all")).toBe("defer");
  });

  // The invariant behind "defer": core's resolver (shouldAskHuman, the same
  // helper both sides share) lets a medium-risk write with the space write
  // mount run unattended under auto — while high/critical always asks, in
  // every mode, so a deferred run still parks on those via the 202 backstop.
  it("core's shared rule: auto + write mount runs medium without a human", () => {
    expect(
      shouldAskHuman({
        mode: "auto",
        requiresApproval: true,
        riskLevel: "medium",
        spaceWriteMounted: true,
      })
    ).toBe(false);
  });

  it("core's shared rule: high risk always asks, even under auto", () => {
    expect(
      shouldAskHuman({
        mode: "auto",
        requiresApproval: false,
        riskLevel: "high",
        spaceWriteMounted: true,
      })
    ).toBe(true);
  });

  it("core's shared rule: manual asks for a medium-risk gated op", () => {
    expect(
      shouldAskHuman({
        mode: "manual",
        requiresApproval: true,
        riskLevel: "medium",
        spaceWriteMounted: true,
      })
    ).toBe(true);
  });
});
