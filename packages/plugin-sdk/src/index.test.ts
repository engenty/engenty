import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
  EngentyPluginApi,
  EngentyPluginFactory,
  EntityEventName,
  EntityEventPayload,
  EntityEventVerb,
  PluginRuntime,
  PluginServerApi,
} from "./index";
import {
  createPluginEventsRuntime,
  createPluginServerGatewayCaller,
  registerAutomationHookListener,
} from "./index";

describe("Engenty plugin factory types", () => {
  it("allows factories to return a plugin runtime", () => {
    const factory: EngentyPluginFactory = (
      engenty: EngentyPluginApi
    ): PluginRuntime => {
      engenty.capabilities.provides("module.test");
      engenty.server.registerOperation({
        operationId: "test_ping",
        riskLevel: "low",
        idempotent: true,
        handler: async () => ({ ok: true }),
      });
      return {
        dispose: () => {},
      };
    };

    expect(typeof factory).toBe("function");
  });
});

describe("createPluginServerGatewayCaller", () => {
  it("delegates invokeOperation to server.callGatewayMethod", async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const hasOperation = vi.fn().mockReturnValue(true);
    const server = {
      callGatewayMethod: invoke,
      hasOperation,
    };
    const ops = createPluginServerGatewayCaller(
      server as unknown as PluginServerApi
    );
    expect(ops.hasOperation("x")).toBe(true);
    await ops.invokeOperation("a_b", { n: 1 }, { auth: undefined });
    expect(invoke).toHaveBeenCalledWith("a_b", { n: 1 }, { auth: undefined });
  });
});

describe("entity event payload contract", () => {
  it("locks the canonical entity event name shape at the type level", () => {
    expectTypeOf<
      EntityEventName<"contacts", "contact", "created">
    >().toEqualTypeOf<"contacts.contact.created">();
    expectTypeOf<EntityEventName<"kb", "article">>().toEqualTypeOf<
      "kb.article.created" | "kb.article.updated" | "kb.article.deleted"
    >();
    expectTypeOf<EntityEventVerb>().toEqualTypeOf<
      "created" | "updated" | "deleted"
    >();
  });

  it("requires tenant_id and the named id field while keeping metadata optional", () => {
    type ContactCreatedPayload = EntityEventPayload<"contact_id">;
    const created: ContactCreatedPayload = {
      tenant_id: "tenant-1",
      contact_id: "contact-1",
    };
    const updated: ContactCreatedPayload = {
      tenant_id: "tenant-1",
      contact_id: "contact-2",
      actor_id: "user-1",
      changed_fields: ["name", "email"],
      scope_id: "scope-1",
    };
    expect(created.tenant_id).toBe("tenant-1");
    expect(created.contact_id).toBe("contact-1");
    expect(updated.changed_fields).toEqual(["name", "email"]);
    expectTypeOf<ContactCreatedPayload>().toMatchTypeOf<{
      tenant_id: string;
      contact_id: string;
    }>();
  });

  it("flows seamlessly through PluginEventsApi.modules.on/emit", async () => {
    type ArticleUpdatedPayload = EntityEventPayload<"article_id">;
    const eventName: EntityEventName<"kb", "article", "updated"> =
      "kb.article.updated";
    const runtime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
    });
    const seen: ArticleUpdatedPayload[] = [];
    runtime.api.modules.on<ArticleUpdatedPayload>(eventName, (payload) => {
      seen.push(payload);
    });
    await runtime.api.modules.emit<ArticleUpdatedPayload>(eventName, {
      tenant_id: "tenant-1",
      article_id: "article-1",
      changed_fields: ["body_md"],
    });
    expect(seen).toEqual([
      {
        tenant_id: "tenant-1",
        article_id: "article-1",
        changed_fields: ["body_md"],
      },
    ]);
  });
});

describe("plugin events runtime", () => {
  it("bridges module emits to the automation hook bus", async () => {
    const runtime = createPluginEventsRuntime();
    const emissions: Array<{
      hookId: string;
      payload: Record<string, unknown>;
    }> = [];
    const unsubscribe = registerAutomationHookListener((hookId, payload) => {
      emissions.push({ hookId, payload });
    });

    try {
      await runtime.api.modules.emit(
        "knowledge-base.inbox.item.created",
        {
          inbox_id: "inbox-1",
        },
        { tenantId: "tenant-1" }
      );
      await runtime.api.core.emit("plugin.loaded", { plugin_id: "kb" });
    } finally {
      unsubscribe();
    }

    expect(emissions).toEqual([
      {
        hookId: "knowledge-base.inbox.item.created",
        payload: { inbox_id: "inbox-1" },
      },
    ]);
  });

  it("isolates observer failures from event emitters", async () => {
    const runtime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
    });
    const observed: string[] = [];

    runtime.api.modules.on("contacts.contact.created", () => {
      throw new Error("listener failed");
    });
    runtime.api.modules.on("contacts.contact.created", (payload) => {
      observed.push(String(payload.contact_id));
    });

    await expect(
      runtime.api.modules.emit("contacts.contact.created", {
        contact_id: "contact-1",
      })
    ).resolves.toBeUndefined();
    expect(observed).toEqual(["contact-1"]);
  });

  it("returns receipts and propagates event context", async () => {
    const registrations: string[] = [];
    const runtime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
      pluginId: "contacts",
      onRegister: (registration) => {
        registrations.push(
          `${registration.namespace}:${registration.listenerKind}:${String(
            registration.eventName
          )}`
        );
      },
    });
    const contexts: Array<{
      listenerModuleId?: string;
      tenantId?: string;
      sourceModuleId?: string;
    }> = [];

    const receipt = runtime.api.modules.on(
      "knowledge-base.inbox.item.created",
      (_payload, context) => {
        contexts.push({
          listenerModuleId: context.listenerModuleId,
          tenantId: context.tenantId,
          sourceModuleId: context.sourceModuleId,
        });
      },
      {
        capability: "contacts.inbox_suggestions",
        tenantScoped: true,
      }
    );

    await runtime.api.modules.emit(
      "knowledge-base.inbox.item.created",
      { inbox_id: "inbox-1" },
      { tenantId: "tenant-1", sourceModuleId: "knowledge-base" }
    );
    await receipt.dispose();
    await runtime.api.modules.emit(
      "knowledge-base.inbox.item.created",
      { inbox_id: "inbox-2" },
      { tenantId: "tenant-1", sourceModuleId: "knowledge-base" }
    );

    expect(receipt).toMatchObject({
      kind: "event.observer",
      pluginId: "contacts",
    });
    expect(registrations).toEqual([
      "modules:observer:knowledge-base.inbox.item.created",
    ]);
    expect(contexts).toEqual([
      {
        listenerModuleId: "contacts",
        tenantId: "tenant-1",
        sourceModuleId: "knowledge-base",
      },
    ]);
  });

  it("skips handlers when runtime invocation gating denies them", async () => {
    const runtime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
      pluginId: "contacts",
      shouldInvoke: ({ context }) => context.tenantId !== "tenant-blocked",
    });
    const observed: string[] = [];

    runtime.api.modules.on("knowledge-base.inbox.item.created", (payload) => {
      observed.push(String(payload.inbox_id));
    });

    await runtime.api.modules.emit(
      "knowledge-base.inbox.item.created",
      { inbox_id: "blocked" },
      { tenantId: "tenant-blocked" }
    );
    await runtime.api.modules.emit(
      "knowledge-base.inbox.item.created",
      { inbox_id: "allowed" },
      { tenantId: "tenant-allowed" }
    );

    expect(observed).toEqual(["allowed"]);
  });

  it("applies filters and interceptors in registration order", async () => {
    const runtime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
    });

    runtime.api.core.filter("operation.context", (payload) => ({
      ...payload,
      tenant_id: "tenant-1",
    }));
    runtime.api.core.filter("operation.context", (payload) => ({
      ...payload,
      actor_id: "agent-1",
    }));
    runtime.api.core.intercept("operation.beforeInvoke", (payload) => ({
      action: "allow",
      payload: { ...payload, checked: true },
    }));
    runtime.api.core.intercept("operation.beforeInvoke", (payload) =>
      payload.operation_id === "contacts_delete"
        ? { action: "block", reason: "blocked by test interceptor" }
        : undefined
    );

    await expect(
      runtime.applyFilters("operation.context", {})
    ).resolves.toEqual({
      tenant_id: "tenant-1",
      actor_id: "agent-1",
    });
    await expect(
      runtime.runInterceptors("operation.beforeInvoke", {
        operation_id: "contacts_get",
      })
    ).resolves.toEqual({
      action: "allow",
      payload: { operation_id: "contacts_get", checked: true },
    });
    await expect(
      runtime.runInterceptors("operation.beforeInvoke", {
        operation_id: "contacts_delete",
      })
    ).resolves.toEqual({
      action: "block",
      payload: { operation_id: "contacts_delete", checked: true },
      reason: "blocked by test interceptor",
    });
  });

  it("rejects invalid event registrations", () => {
    const runtime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
    });

    expect(() => runtime.api.modules.on("" as never, () => {})).toThrow(
      "missing event name"
    );
    expect(() =>
      runtime.api.modules.on("operation.beforeInvoke" as never, () => {})
    ).toThrow("Invalid module plugin event name");
    expect(() =>
      runtime.api.modules.on("knowledge-base" as never, () => {})
    ).toThrow("Invalid module plugin event name");
    expect(() =>
      runtime.api.core.on(
        "knowledge-base.inbox.item.created" as never,
        () => {}
      )
    ).toThrow("Invalid core plugin event name");
    expect(() =>
      runtime.api.modules.on(
        "knowledge-base.inbox.item.created",
        undefined as never
      )
    ).toThrow("missing handler");
  });

  it("rejects duplicate active event receipt ids", async () => {
    const runtime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
      createRegistrationReceipt: ({ kind }) => ({
        dispose: () => {},
        id: `contacts:${kind}:duplicate`,
        kind,
        pluginId: "contacts",
      }),
    });

    const receipt = runtime.api.modules.on(
      "knowledge-base.inbox.item.created",
      () => {}
    );
    expect(() =>
      runtime.api.modules.on("knowledge-base.inbox.item.created", () => {})
    ).toThrow("Duplicate plugin event receipt id");

    await receipt.dispose();
    expect(() =>
      runtime.api.modules.on("knowledge-base.inbox.item.created", () => {})
    ).not.toThrow();
  });
});
