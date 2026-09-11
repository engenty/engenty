import type { AgentConfig } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import type { RootDelegationToolsInput } from "../root-delegation-tools.js";
import { createRootDelegationTools } from "../root-delegation-tools.js";

const rootConfig: AgentConfig = {
  id: "engenty.copilot",
  instructions: "test",
  model: "openai/test",
  name: "Copilot",
  skillIds: [],
  source: "builtin",
  subAgents: [
    { alias: "sales", id: "sales.researcher" },
    { alias: "invoices", id: "invoices.manager" },
  ],
  toolIds: ["message_agent"],
};

function input(
  spaceResolution: RootDelegationToolsInput["spaceResolution"]
): RootDelegationToolsInput {
  return {
    onProgress: vi.fn(),
    parentThreadId: "thread-1",
    registry: {} as never,
    resolveChildWorkspace: vi.fn(async () => undefined),
    rootAgentId: "engenty.copilot",
    rootConfig,
    scope: {
      isSuperAdmin: false,
      isTenantAdmin: false,
      tenantId: "tenant-1",
      tenantRole: "member",
      userId: "user-1",
    } as never,
    spaceResolution,
    store: {} as never,
  };
}

describe("createRootDelegationTools", () => {
  it("builds generic and mounted internal tools from one resolved Space", () => {
    const result = createRootDelegationTools(
      input({
        kind: "resolved",
        space: {
          agentIds: new Set(["sales.researcher"]),
        } as never,
      })
    );
    expect(Object.keys(result.extraTools).sort()).toEqual([
      "agent-sales",
      "message_agent",
    ]);
    expect(result.skipNativeSubAgents).toBe(true);
  });

  it("keeps only message_agent for an empty or unresolved Space", () => {
    const empty = createRootDelegationTools(
      input({
        kind: "resolved",
        space: { agentIds: new Set() } as never,
      })
    );
    const unresolved = createRootDelegationTools(
      input({
        claimed_space_id: "space-1",
        kind: "unresolved",
        reason: "unavailable",
      })
    );
    expect(Object.keys(empty.extraTools)).toEqual(["message_agent"]);
    expect(Object.keys(unresolved.extraTools)).toEqual(["message_agent"]);
    expect(empty.skipNativeSubAgents).toBe(true);
    expect(unresolved.skipNativeSubAgents).toBe(true);
  });

  it("retains all declared child tools only for intentional no-Space runs", () => {
    const result = createRootDelegationTools(input({ kind: "global" }));
    expect(Object.keys(result.extraTools).sort()).toEqual([
      "agent-invoices",
      "agent-sales",
      "message_agent",
    ]);
  });
});
