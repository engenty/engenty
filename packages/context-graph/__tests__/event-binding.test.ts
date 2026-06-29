// Unit tests for `attachContextGraphEventBindings`. Uses a tiny fake events
// API and a stub `ContextGraphServerApi` so we can assert the binding
// translates event payloads into the right server API calls without a DB.

import type {
  ContextGraphEventBinding,
  PluginEventsApi,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { attachContextGraphEventBindings } from "../src/event-binding.js";
import type { ContextGraphServerApi } from "../src/server-api.js";

interface FakeEvents {
  api: PluginEventsApi;
  emit: (
    name: string,
    payload: Record<string, unknown>,
    ctx?: { tenantId?: string }
  ) => Promise<void>;
}

function createFakeEvents(): FakeEvents {
  type Handler = (
    payload: Record<string, unknown>,
    ctx: { tenantId?: string }
  ) => Promise<void>;
  const handlers = new Map<
    string,
    Array<{ handler: Handler; tenantScoped: boolean }>
  >();
  const api = {
    core: { emit: vi.fn(), on: vi.fn() },
    modules: {
      emit: vi.fn(),
      on: (
        name: string,
        handler: Handler,
        opts?: { tenantScoped?: boolean }
      ) => {
        const list = handlers.get(name) ?? [];
        list.push({ handler, tenantScoped: opts?.tenantScoped ?? true });
        handlers.set(name, list);
        return {
          dispose: async () => {
            handlers.delete(name);
          },
          id: `evt:${name}`,
        };
      },
    },
  } as unknown as PluginEventsApi;
  return {
    api,
    emit: async (name, payload, ctx) => {
      const list = handlers.get(name) ?? [];
      const tenantId = ctx?.tenantId;
      for (const { handler, tenantScoped } of list) {
        if (tenantScoped && !tenantId) {
          continue;
        }
        await handler(payload, { tenantId });
      }
    },
  };
}

function createFakeApi(): ContextGraphServerApi & {
  calls: { name: string; args: unknown }[];
} {
  const calls: { name: string; args: unknown }[] = [];
  const record =
    <K extends string>(name: K) =>
    (args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve({ id: `${name}-id`, type: "x" } as never);
    };
  return {
    calls,
    upsertEntity: record(
      "upsertEntity"
    ) as ContextGraphServerApi["upsertEntity"],
    deleteEntity: record(
      "deleteEntity"
    ) as ContextGraphServerApi["deleteEntity"],
    getEntity: (args: { tenantId: string; externalRef?: unknown }) => {
      calls.push({ name: "getEntity", args });
      return Promise.resolve({ id: "other-entity-id" } as never);
    },
    upsertEdge: record("upsertEdge") as ContextGraphServerApi["upsertEdge"],
    deleteEdge: record("deleteEdge") as ContextGraphServerApi["deleteEdge"],
    listEdges: record("listEdges") as ContextGraphServerApi["listEdges"],
  };
}

describe("attachContextGraphEventBindings", () => {
  it("upsert binding calls upsertEntity and upsertEdge for each declared edge", async () => {
    const events = createFakeEvents();
    const api = createFakeApi();
    const binding: ContextGraphEventBinding = {
      name: "contacts.contact.updated",
      action: "upsert",
      load: (payload) => ({
        entity: {
          type: "contacts.person",
          externalRef: {
            module: "contacts",
            entity: "contact",
            id: (payload as { id: string }).id,
          },
          name: (payload as { name?: string }).name,
        },
        edges: [
          {
            type: "contacts_works_at",
            direction: "out",
            other: {
              module: "contacts",
              entity: "contact",
              id: "org-1",
            },
          },
        ],
      }),
    };
    attachContextGraphEventBindings({
      bindings: [binding],
      contextGraph: api,
      events: events.api,
    });
    await events.emit(
      "contacts.contact.updated",
      { id: "person-1", name: "Ada" },
      { tenantId: "tenant-1" }
    );
    const names = api.calls.map((c) => c.name);
    expect(names).toContain("upsertEntity");
    expect(names).toContain("getEntity");
    expect(names).toContain("upsertEdge");
    const upsertEntity = api.calls.find((c) => c.name === "upsertEntity")
      ?.args as { tenantId: string; type: string };
    expect(upsertEntity.tenantId).toBe("tenant-1");
    expect(upsertEntity.type).toBe("contacts.person");
  });

  it("delete binding calls deleteEntity by external ref", async () => {
    const events = createFakeEvents();
    const api = createFakeApi();
    const binding: ContextGraphEventBinding = {
      name: "contacts.contact.deleted",
      action: "delete",
      externalRef: (payload) => ({
        module: "contacts",
        entity: "contact",
        id: (payload as { id: string }).id,
      }),
    };
    attachContextGraphEventBindings({
      bindings: [binding],
      contextGraph: api,
      events: events.api,
    });
    await events.emit(
      "contacts.contact.deleted",
      { id: "person-1" },
      { tenantId: "tenant-1" }
    );
    expect(api.calls.map((c) => c.name)).toEqual(["deleteEntity"]);
    const args = api.calls[0]?.args as {
      tenantId: string;
      externalRef: { id: string };
    };
    expect(args.tenantId).toBe("tenant-1");
    expect(args.externalRef.id).toBe("person-1");
  });

  it("tenantScoped default: missing tenantId silently no-ops", async () => {
    const events = createFakeEvents();
    const api = createFakeApi();
    const binding: ContextGraphEventBinding = {
      name: "contacts.contact.updated",
      action: "upsert",
      load: () => ({
        entity: { type: "contacts.person" },
      }),
    };
    attachContextGraphEventBindings({
      bindings: [binding],
      contextGraph: api,
      events: events.api,
    });
    await events.emit("contacts.contact.updated", { id: "x" }, {});
    expect(api.calls).toHaveLength(0);
  });

  it("falls back to payload.tenant_id when ctx is missing", async () => {
    const events = createFakeEvents();
    const api = createFakeApi();
    const binding: ContextGraphEventBinding = {
      name: "contacts.contact.updated",
      action: "upsert",
      tenantScoped: false,
      load: (p) => ({
        entity: {
          type: "contacts.person",
          externalRef: {
            module: "contacts",
            entity: "contact",
            id: (p as { id: string }).id,
          },
        },
      }),
    };
    attachContextGraphEventBindings({
      bindings: [binding],
      contextGraph: api,
      events: events.api,
    });
    await events.emit(
      "contacts.contact.updated",
      { id: "person-1", tenant_id: "tenant-from-payload" },
      {}
    );
    const upsertEntity = api.calls.find((c) => c.name === "upsertEntity")
      ?.args as { tenantId: string };
    expect(upsertEntity.tenantId).toBe("tenant-from-payload");
  });

  it("load returning null is a no-op", async () => {
    const events = createFakeEvents();
    const api = createFakeApi();
    const binding: ContextGraphEventBinding = {
      name: "contacts.contact.updated",
      action: "upsert",
      load: () => null,
    };
    attachContextGraphEventBindings({
      bindings: [binding],
      contextGraph: api,
      events: events.api,
    });
    await events.emit(
      "contacts.contact.updated",
      { id: "x" },
      { tenantId: "t1" }
    );
    expect(api.calls).toHaveLength(0);
  });
});
