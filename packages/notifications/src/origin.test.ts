import { describe, expect, it } from "vitest";
import {
  approvalSummary,
  coalesceKeyFor,
  humanizeOperationId,
  type OriginLookups,
  resolveOrigin,
} from "./origin.js";

const lookups: OriginLookups = {
  agent: async (_tenant, id) =>
    id === "6032b409-10b8-4ef7-a3ba-f4bb7fa67afb" || id === "inbox.assist"
      ? { id: "inbox.assist", name: "Inbox Assistant" }
      : null,
  space: async (_tenant, id) =>
    id === "space-1" ? { key: "second-brain", name: "Second Brain" } : null,
  user: async (_tenant, id) =>
    id === "user-1" ? { name: "Matthias Platzer" } : null,
};

describe("resolveOrigin", () => {
  it("turns the gate's principal uuid into the registry agent and its name", async () => {
    // The 2026-09-06 row: actor_id was a core principal uuid nobody could
    // resolve in the UI, space_id null. The origin is what the list shows.
    const origin = await resolveOrigin(
      {
        actorId: "6032b409-10b8-4ef7-a3ba-f4bb7fa67afb",
        actorKind: "agent",
        spaceId: "space-1",
        tenantId: "t1",
      },
      lookups
    );
    expect(origin.actor).toEqual({ id: "inbox.assist", kind: "agent" });
    expect(origin.metadata).toEqual({
      actor_label: "Inbox Assistant",
      actor_ref: "agent:inbox.assist",
      space_key: "second-brain",
      space_name: "Second Brain",
    });
  });

  it("keeps an unknown agent as an agent with its id as the label", async () => {
    const origin = await resolveOrigin(
      { actorId: "ghost", actorKind: "agent", spaceId: null, tenantId: "t1" },
      lookups
    );
    expect(origin.actor).toEqual({ id: "ghost", kind: "agent" });
    expect(origin.metadata).toEqual({
      actor_label: "ghost",
      actor_ref: "agent:ghost",
    });
  });

  it("labels a user by name", async () => {
    const origin = await resolveOrigin(
      { actorId: "user-1", actorKind: "user", spaceId: null, tenantId: "t1" },
      lookups
    );
    expect(origin.metadata.actor_label).toBe("Matthias Platzer");
    expect(origin.metadata.actor_ref).toBe("user:user-1");
  });
});

describe("summary + coalesce key", () => {
  it("writes the ask for a person", () => {
    expect(
      approvalSummary({
        actorLabel: "Inbox Assistant",
        operationId: "inbox_sync_run",
        spaceName: "Second Brain",
      })
    ).toBe("Inbox Assistant wants to run inbox sync run in Second Brain");
    expect(
      approvalSummary({
        actorLabel: undefined,
        operationId: "kb_article_create",
        spaceName: undefined,
      })
    ).toBe("An agent wants to run kb article create");
    expect(humanizeOperationId("connections.oauth_start")).toBe(
      "connections oauth start"
    );
  });

  it("keys one row per actor + operation + space", () => {
    expect(
      coalesceKeyFor({
        actorRef: "agent:inbox.assist",
        operationId: "inbox_sync_run",
        spaceId: "space-1",
      })
    ).toBe("agent:inbox.assist:inbox_sync_run:space-1");
    expect(
      coalesceKeyFor({
        actorRef: null,
        operationId: "x",
        spaceId: null,
      })
    ).toBe("unknown:x:global");
  });
});
