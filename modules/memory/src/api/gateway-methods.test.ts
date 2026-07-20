// Governance rules of the memory gateway ops:
//   - org scope + agent principal → status forced to 'proposed'
//   - agents cannot claim 'human' provenance (source_kind coerced)
//   - scope_ref required for user/project/entity, forbidden for org
//   - agents never archive human-authored / org / proposed records
//   - approve is user-principal-only and requires status 'proposed'

import type {
  PluginAuthContext,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryRecord } from "../schema/zod.js";
import type { MemoryRecordUpsert, MemoryRepo } from "../dal/contracts.js";
import { registerMemoryGatewayMethods } from "./gateway-methods.js";

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "m1",
    tenant_id: "tenant-1",
    scope_id: "default",
    scope_kind: "user",
    scope_ref: "user-1",
    kind: "preference",
    slug: "prefers-brief-emails",
    title: "Prefers brief emails",
    body_md: "Short.",
    source_kind: "agent",
    agent_type_key: null,
    confidence: "medium",
    status: "active",
    supersedes: null,
    created_by: "user-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

const userAuth: PluginAuthContext = {
  principalId: "user-1",
  scopeId: "default",
  tenantId: "tenant-1",
};

const agentAuth: PluginAuthContext = {
  ...userAuth,
  agentId: "agent-uuid-1",
};

describe("memory gateway methods", () => {
  let ops: Map<string, PluginServerOperation>;
  let repo: MemoryRepo;
  let upserts: MemoryRecordUpsert[];
  let existing: MemoryRecord | null;

  beforeEach(() => {
    ops = new Map();
    upserts = [];
    existing = record();
    repo = {
      upsert: vi.fn(async (input: MemoryRecordUpsert) => {
        upserts.push(input);
        return record({ status: input.status ?? "active" });
      }),
      getById: vi.fn(async () => existing),
      list: vi.fn(async () => [record()]),
      archive: vi.fn(async () => record({ status: "archived" })),
      approve: vi.fn(async () => record({ status: "active" })),
    };
    const api = {
      registerOperation: (op: PluginServerOperation) => {
        ops.set(op.operationId, op);
      },
    } as unknown as PluginServerApi;
    registerMemoryGatewayMethods(api, () => repo);
  });

  function run(opId: string, input: unknown, auth: PluginAuthContext) {
    const op = ops.get(opId);
    if (!op) {
      throw new Error(`op ${opId} not registered`);
    }
    return op.handler(input, { auth } as never);
  }

  const upsertInput = {
    scope_kind: "user",
    scope_ref: "user-1",
    slug: "prefers-brief-emails",
    title: "Prefers brief emails",
    body_md: "Short.",
  };

  it("registers the four ops with the expected capabilities", () => {
    expect(ops.get("memory_record_upsert")?.requiredCapabilities).toEqual([
      "module.memory.write",
    ]);
    expect(ops.get("memory_record_list")?.requiredCapabilities).toEqual([
      "module.memory.read",
    ]);
    expect(ops.get("memory_record_archive")?.requiredCapabilities).toEqual([
      "module.memory.write",
    ]);
    expect(ops.get("memory_record_approve")?.requiredCapabilities).toEqual([
      "module.memory.approve",
    ]);
    // Writes stay approval-free (they must run under approvalPolicy 'deny').
    expect(ops.get("memory_record_upsert")?.requiresApproval).toBeUndefined();
    expect(ops.get("memory_record_upsert")?.riskLevel).toBe("low");
  });

  it("forces org-scope agent writes to status 'proposed'", async () => {
    await run(
      "memory_record_upsert",
      { ...upsertInput, scope_kind: "org", scope_ref: undefined },
      agentAuth
    );
    expect(upserts[0]?.status).toBe("proposed");
  });

  it("does not force a status for org-scope human writes", async () => {
    await run(
      "memory_record_upsert",
      { ...upsertInput, scope_kind: "org", scope_ref: undefined },
      userAuth
    );
    expect(upserts[0]?.status).toBeUndefined();
  });

  it("requires scope_ref for non-org scopes and rejects it for org", async () => {
    await expect(
      run(
        "memory_record_upsert",
        { ...upsertInput, scope_ref: undefined },
        userAuth
      )
    ).rejects.toThrow(/scope_ref is required/);
    await expect(
      run(
        "memory_record_upsert",
        { ...upsertInput, scope_kind: "org", scope_ref: "user-1" },
        userAuth
      )
    ).rejects.toThrow(/org scope takes no scope_ref/);
  });

  it("coerces agent-claimed 'human' provenance to 'agent', keeps 'reflection'", async () => {
    await run(
      "memory_record_upsert",
      { ...upsertInput, source_kind: "human" },
      agentAuth
    );
    expect(upserts[0]?.source_kind).toBe("agent");
    await run(
      "memory_record_upsert",
      { ...upsertInput, source_kind: "reflection" },
      agentAuth
    );
    expect(upserts[1]?.source_kind).toBe("reflection");
  });

  it("stamps agent attribution on agent writes only", async () => {
    await run(
      "memory_record_upsert",
      { ...upsertInput, agent_type_key: "contacts.manager" },
      agentAuth
    );
    expect(upserts[0]?.agent_type_key).toBe("contacts.manager");
    await run("memory_record_upsert", upsertInput, userAuth);
    expect(upserts[1]?.agent_type_key).toBeNull();
    expect(upserts[1]?.source_kind).toBe("human");
  });

  it("blocks agents from archiving human-authored, org, and proposed records", async () => {
    existing = record({ source_kind: "human" });
    await expect(
      run("memory_record_archive", { id: "m1" }, agentAuth)
    ).rejects.toThrow(/human-authored/);
    existing = record({ scope_kind: "org", scope_ref: null });
    await expect(
      run("memory_record_archive", { id: "m1" }, agentAuth)
    ).rejects.toThrow(/org-wide/);
    existing = record({ status: "proposed" });
    await expect(
      run("memory_record_archive", { id: "m1" }, agentAuth)
    ).rejects.toThrow(/proposed/);
    expect(repo.archive).not.toHaveBeenCalled();
  });

  it("lets agents archive their own active records, and humans archive anything", async () => {
    existing = record({ source_kind: "agent" });
    await run("memory_record_archive", { id: "m1" }, agentAuth);
    existing = record({ source_kind: "human" });
    await run("memory_record_archive", { id: "m1" }, userAuth);
    expect(repo.archive).toHaveBeenCalledTimes(2);
  });

  it("approve: rejects agent principals and non-proposed records", async () => {
    existing = record({ status: "proposed" });
    await expect(
      run("memory_record_approve", { id: "m1" }, agentAuth)
    ).rejects.toThrow(/only a human user/);
    existing = record({ status: "active" });
    await expect(
      run("memory_record_approve", { id: "m1" }, userAuth)
    ).rejects.toThrow(/not 'proposed'/);
    existing = record({ status: "proposed" });
    await run("memory_record_approve", { id: "m1" }, userAuth);
    expect(repo.approve).toHaveBeenCalledWith("m1");
  });
});
