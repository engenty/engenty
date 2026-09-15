import type { AgentConfig } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import {
  parseRemoteAddress,
  remoteHandleFor,
  resolveRemoteTarget,
} from "../remote-channels/remote-agent-routing.js";
import { remoteAgentThreadId } from "../remote-channels/remote-agent-turn.js";

function agent(id: string, extra: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id,
    instructions: "",
    model: "test",
    name: id,
    skillIds: [],
    toolIds: [],
    ...extra,
  } as AgentConfig;
}

const sales = agent("acme.sales", { remoteEnabled: true });
const legal = agent("acme.legal", {
  remoteEnabled: true,
  remoteHandle: "counsel",
});
const hidden = agent("acme.hidden");
const roster = [sales, legal, hidden];
const listAgents = () => Promise.resolve(roster);

describe("remoteHandleFor", () => {
  it("prefers the row's handle and falls back to the id's last segment", () => {
    expect(remoteHandleFor(legal)).toBe("counsel");
    expect(remoteHandleFor(sales)).toBe("sales");
    expect(remoteHandleFor(agent("Acme.Support Desk"))).toBe("support-desk");
  });
});

describe("parseRemoteAddress", () => {
  it("reads a leading @handle or /to handle and strips it", () => {
    expect(parseRemoteAddress("@sales what's open?")).toEqual({
      handle: "sales",
      text: "what's open?",
    });
    expect(parseRemoteAddress("@Sales: what's open?")).toEqual({
      handle: "sales",
      text: "what's open?",
    });
    expect(parseRemoteAddress("/to counsel review this")).toEqual({
      handle: "counsel",
      text: "review this",
    });
    expect(parseRemoteAddress("@sales")).toEqual({ handle: "sales", text: "" });
  });

  it("ignores mentions that are not at the start and Slack user ids", () => {
    expect(parseRemoteAddress("ask @sales later")).toBeNull();
    expect(parseRemoteAddress("<@U12345> hello")).toBeNull();
    expect(parseRemoteAddress("plain text")).toBeNull();
  });
});

describe("resolveRemoteTarget", () => {
  it("routes an @handle to the reachable agent with the address stripped", async () => {
    const target = await resolveRemoteTarget({
      bindingAgentId: "engenty.remote",
      listAgents,
      text: "@counsel is this clause fine?",
    });
    expect(target).toMatchObject({
      agent: { id: "acme.legal" },
      kind: "agent",
      text: "is this clause fine?",
    });
  });

  it("refuses an address to an agent that did not opt in — never re-routes it", async () => {
    expect(
      await resolveRemoteTarget({
        bindingAgentId: null,
        listAgents,
        text: "@hidden do the thing",
      })
    ).toEqual({ handle: "hidden", kind: "unreachable" });
    expect(
      await resolveRemoteTarget({
        bindingAgentId: null,
        listAgents,
        text: "@nobody hi",
      })
    ).toEqual({ handle: "nobody", kind: "unreachable" });
  });

  it("uses the binding's default agent when it is reachable", async () => {
    const target = await resolveRemoteTarget({
      bindingAgentId: "acme.sales",
      listAgents,
      text: "pipeline?",
    });
    expect(target).toMatchObject({
      agent: { id: "acme.sales" },
      kind: "agent",
      text: "pipeline?",
    });
  });

  it("falls back to the front door when the binding's agent is not reachable or is the front door", async () => {
    expect(
      await resolveRemoteTarget({
        bindingAgentId: "acme.hidden",
        listAgents,
        text: "hi",
      })
    ).toEqual({ kind: "front-door", text: "hi" });
    expect(
      await resolveRemoteTarget({
        bindingAgentId: "engenty.remote",
        listAgents,
        text: "hi",
      })
    ).toEqual({ kind: "front-door", text: "hi" });
  });
});

describe("remoteAgentThreadId", () => {
  it("is a stable RFC 4122 uuid per (tenant, platform, thread, agent)", () => {
    const base = {
      agentId: "acme.sales",
      externalThreadId: "C123/1700000000.000100",
      platform: "slack",
      tenantId: "t1",
    };
    const id = remoteAgentThreadId(base);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(remoteAgentThreadId(base)).toBe(id);
    expect(remoteAgentThreadId({ ...base, agentId: "acme.legal" })).not.toBe(
      id
    );
  });
});
