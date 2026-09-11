// HEARTBEAT.md reaches a run only when the run is one nobody asked for.

import { beforeEach, describe, expect, it, vi } from "vitest";

const registeredDocuments = vi.fn(() => [] as unknown[]);
const getScopedOverride = vi.fn(async (..._args: unknown[]) => null as unknown);
const dbSource = vi.fn(() => ({}) as unknown);

vi.mock("@engenty/ai-core", () => ({
  listRegisteredInstructionDocuments: () => registeredDocuments(),
}));
vi.mock("../../../dal/instructions/instruction-overrides-store.js", () => ({
  createInstructionOverridesStore: () => ({ getScopedOverride }),
}));
vi.mock("../../../infra/tenant-db.js", () => ({
  createDbSourceFromEnv: () => dbSource(),
}));

import {
  findHeartbeatDocument,
  resolveHeartbeatInstructions,
} from "../heartbeat-layer.js";

const HEARTBEAT = {
  default_body: "  Sweep the goals, report nothing if nothing changed.  ",
  filename: "HEARTBEAT.md",
  key: "coordinator.heartbeat",
  owner_id: "engenty.coordinator",
  owner_kind: "agent",
};

const SOUL = {
  default_body: "Be brief.",
  filename: "SOUL.md",
  key: "coordinator.soul",
  owner_id: "engenty.coordinator",
  owner_kind: "agent",
};

const scope = {
  agentId: "engenty.coordinator",
  tenantId: "tenant",
  userId: "user",
};

beforeEach(() => {
  registeredDocuments.mockReturnValue([SOUL, HEARTBEAT]);
  getScopedOverride.mockReset();
  getScopedOverride.mockResolvedValue(null);
  dbSource.mockReturnValue({});
});

describe("findHeartbeatDocument", () => {
  it("picks the agent's HEARTBEAT.md out of its instruction documents", () => {
    expect(findHeartbeatDocument("engenty.coordinator")).toEqual({
      body: "Sweep the goals, report nothing if nothing changed.",
      key: "coordinator.heartbeat",
    });
  });

  it("is null for an agent that ships none", () => {
    expect(findHeartbeatDocument("contacts.manager")).toBeNull();
  });

  it("treats an empty heartbeat as none at all", () => {
    registeredDocuments.mockReturnValue([{ ...HEARTBEAT, default_body: "  " }]);
    expect(findHeartbeatDocument("engenty.coordinator")).toBeNull();
  });
});

describe("resolveHeartbeatInstructions", () => {
  it("uses the shipped text when nothing overrides it", async () => {
    await expect(resolveHeartbeatInstructions(scope)).resolves.toBe(
      "Sweep the goals, report nothing if nothing changed."
    );
  });

  it("prefers a tenant override", async () => {
    getScopedOverride.mockImplementation(async (params: unknown) =>
      (params as { scope: string }).scope === "tenant"
        ? { body: "Only look at overdue offers." }
        : null
    );
    await expect(resolveHeartbeatInstructions(scope)).resolves.toBe(
      "Only look at overdue offers."
    );
  });

  it("falls back to the shipped text when the override lookup fails", async () => {
    getScopedOverride.mockRejectedValue(new Error("db down"));
    await expect(resolveHeartbeatInstructions(scope)).resolves.toBe(
      "Sweep the goals, report nothing if nothing changed."
    );
  });

  it("is null for an agent with no heartbeat, without touching the store", async () => {
    await expect(
      resolveHeartbeatInstructions({ ...scope, agentId: "contacts.manager" })
    ).resolves.toBeNull();
    expect(getScopedOverride).not.toHaveBeenCalled();
  });
});
