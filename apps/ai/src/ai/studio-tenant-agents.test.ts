import type { Agent } from "@mastra/core/agent";
import type { Mastra } from "@mastra/core/mastra";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateStudioTenant,
  getActivatedStudioTenantId,
  isStudioReservedAgentId,
  resetStudioTenantStateForTests,
  resolveStudioPlayAlsContext,
} from "./studio-tenant-agents.js";

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";
const USER = "00000000-0000-4000-8000-00000000000c";

afterEach(() => {
  resetStudioTenantStateForTests();
});

describe("isStudioReservedAgentId", () => {
  it("skips copilot, scheduler, and remote", () => {
    expect(isStudioReservedAgentId("engenty.copilot")).toBe(true);
    expect(isStudioReservedAgentId("engenty.scheduler")).toBe(true);
    expect(isStudioReservedAgentId("engenty.remote")).toBe(true);
    expect(isStudioReservedAgentId("mail-collector")).toBe(false);
  });
});

describe("activateStudioTenant", () => {
  it("registers non-reserved agents and replaces a previous tenant", async () => {
    const addAgent = vi.fn();
    const removeAgent = vi.fn(() => true);
    const mastra = { addAgent, removeAgent } as unknown as Mastra;
    const assembleAgent = vi.fn(
      async (_registry, id: string) => ({ id }) as unknown as Agent
    );

    const first = await activateStudioTenant({
      mastra,
      tenantId: TENANT_A,
      assembleAgent,
      createRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(),
          listAgentConfigs: async () => [
            { id: "engenty.copilot", name: "Copilot" },
            { id: "mail-collector", name: "Mail" },
            { id: "inbox.triage", name: "Triage" },
          ],
        }) as never,
    });

    expect(first.tenantId).toBe(TENANT_A);
    expect(first.agentIds).toEqual(["mail-collector", "inbox.triage"]);
    expect(addAgent).toHaveBeenCalledTimes(2);
    expect(getActivatedStudioTenantId()).toBe(TENANT_A);

    await activateStudioTenant({
      mastra,
      tenantId: TENANT_B,
      assembleAgent,
      createRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(),
          listAgentConfigs: async () => [{ id: "other.agent", name: "Other" }],
        }) as never,
    });

    expect(removeAgent).toHaveBeenCalledWith("mail-collector");
    expect(removeAgent).toHaveBeenCalledWith("inbox.triage");
    expect(getActivatedStudioTenantId()).toBe(TENANT_B);
    expect(addAgent).toHaveBeenCalledTimes(3);
  });
});

describe("resolveStudioPlayAlsContext", () => {
  it("adds tenant and user only when JWT tenant equals the pin", async () => {
    const addAgent = vi.fn();
    const mastra = {
      addAgent,
      removeAgent: vi.fn(() => true),
    } as unknown as Mastra;
    await activateStudioTenant({
      mastra,
      tenantId: TENANT_A,
      assembleAgent: async () => ({ id: "x" }) as unknown as Agent,
      createRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(),
          listAgentConfigs: async () => [{ id: "x", name: "X" }],
        }) as never,
    });

    const matching = await resolveStudioPlayAlsContext({
      accessToken: "tok",
      authorization: "Bearer tok",
      scopeResolver: async () => ({
        ok: true,
        scope: {
          tenantId: TENANT_A,
          userId: USER,
          capabilities: [],
          isSuperAdmin: false,
          isTenantAdmin: false,
          tenantRole: "member",
        },
      }),
    });
    expect(matching).toEqual({
      accessToken: "tok",
      tenantId: TENANT_A,
      userId: USER,
    });

    const mismatch = await resolveStudioPlayAlsContext({
      accessToken: "tok",
      authorization: "Bearer tok",
      scopeResolver: async () => ({
        ok: true,
        scope: {
          tenantId: TENANT_B,
          userId: USER,
          capabilities: [],
          isSuperAdmin: false,
          isTenantAdmin: false,
          tenantRole: "member",
        },
      }),
    });
    expect(mismatch).toEqual({ accessToken: "tok" });
  });
});
