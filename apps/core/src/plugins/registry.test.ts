import {
  listActiveAiRegistrations,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createGatedQueueHandlers } from "./queue-handler-gating.js";
import { createPluginRegistry, type PluginRecord } from "./registry.js";
import { startRegisteredServices } from "./service-lifecycle.js";
import { makePluginRecord } from "./test-fixtures.js";

const AI_MODULE = "registry-owned-ai";

afterEach(() => {
  unregisterAiRegistration(AI_MODULE);
});

const silentLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

function setup() {
  return createPluginRegistry({
    config: {},
    dataDir: "/tmp",
    logger: silentLogger,
    resolvePath: (p) => p,
  });
}

function createRecord(id: string): PluginRecord {
  return makePluginRecord({ id, source: `/plugins/${id}.ts` });
}

describe("createPluginRegistry", () => {
  it("refuses a second route on an already registered method and path", async () => {
    const { registry, createApi } = setup();
    const first = createRecord("first");
    const second = createRecord("second");
    registry.plugins.push(first, second);

    createApi(first, {}).server.registerHttpRoute({
      method: "get",
      path: "/api/hello",
      handler: async () => ({ owner: "first" }),
    });
    createApi(second, {}).server.registerHttpRoute({
      method: "get",
      path: "/api/hello",
      handler: async () => ({ owner: "second" }),
    });

    expect(registry.httpRoutes.map((entry) => entry.pluginId)).toEqual([
      "first",
    ]);
  });

  it("refuses another plugin's registration of an existing operation id", async () => {
    const { registry, createApi } = setup();
    const contacts = createRecord("contacts");
    const intruder = createRecord("intruder");
    registry.plugins.push(contacts, intruder);

    createApi(contacts, {}).server.registerOperation({
      operationId: "contacts_get",
      moduleId: "contacts",
      handler: async () => ({ owner: "contacts" }),
    });
    const receipt = createApi(intruder, {}).server.registerOperation({
      operationId: "contacts_get",
      moduleId: "contacts",
      handler: async () => ({ owner: "intruder" }),
    });

    expect(receipt).toBeUndefined();
    expect(registry.moduleOperations.map((entry) => entry.pluginId)).toEqual([
      "contacts",
    ]);
  });

  it("starts services only for enabled plugins whose required dependencies are enabled", async () => {
    const started: string[] = [];
    const { registry, createApi } = setup();
    const allowed = createRecord("allowed");
    const disabled = createRecord("disabled");
    disabled.enabled = false;
    const dependency = createRecord("contacts");
    dependency.enabled = false;
    const dependent = createRecord("dependent");
    dependent.requires = ["contacts"];
    registry.plugins.push(allowed, disabled, dependency, dependent);

    for (const record of [allowed, disabled, dependent]) {
      createApi(record, {}).server.registerService({
        id: `${record.id}-service`,
        start: () => {
          started.push(record.id);
        },
      });
    }

    await Promise.all(
      startRegisteredServices(registry, {
        config: {},
        dataDir: "/tmp",
        logger: silentLogger,
        pluginConfig: {},
        resolvePath: (p) => p,
      })
    );

    expect(started).toEqual(["allowed"]);
  });

  it("removes every registration owned by a plugin and keeps other plugins' registrations", async () => {
    const { registry, createApi } = setup();
    const contacts = createRecord(AI_MODULE);
    const invoices = createRecord("invoices");
    registry.plugins.push(contacts, invoices);
    const contactsApi = createApi(contacts, {});

    contactsApi.server.registerHttpRoute({
      method: "get",
      path: "/api/contacts",
      handler: async () => [],
    });
    contactsApi.server.registerOperation({
      operationId: "contacts_list",
      moduleId: AI_MODULE,
      handler: async () => [],
    });
    contactsApi.server.registerService({
      id: "contacts-sync",
      start: async () => {},
    });
    contactsApi.server.registerFeatureFlags([
      { default: true, key: "contacts.bulk", namespace: "contacts" },
    ] as never);
    contactsApi.server.registerQueue?.({
      label: "Enrich",
      name: "contacts_enrich",
    });
    contactsApi.server.registerQueueHandler?.(
      "contacts_enrich",
      async () => {}
    );
    contactsApi.server.registerTestDataType({
      meta: {
        data_type: "people",
        description: "People",
        module_id: AI_MODULE,
        recordSchema: z.object({ id: z.string() }),
        schemaDescription: "id",
      },
      persist: async () => 0,
    });
    contactsApi.server.registerAiRegistration({
      agents: [],
      module_id: AI_MODULE,
      triggers: [],
    });
    createApi(invoices, {}).server.registerHttpRoute({
      method: "get",
      path: "/api/invoices",
      handler: async () => [],
    });

    await registry.removeOwnedRegistrations?.(AI_MODULE);

    expect(registry.httpRoutes.map((entry) => entry.pluginId)).toEqual([
      "invoices",
    ]);
    expect(registry.moduleOperations).toEqual([]);
    expect(registry.services).toEqual([]);
    expect(registry.featureFlags).toEqual([]);
    expect(registry.queueDefinitions).toEqual([]);
    expect(registry.queueHandlers.size).toBe(0);
    expect(registry.testDataTypes).toEqual([]);
    expect(
      listActiveAiRegistrations().some(
        (registration) => registration.module_id === AI_MODULE
      )
    ).toBe(false);
  });

  it("refuses queued work for a tenant-disabled owner or dependency", async () => {
    const { registry, createApi } = setup();
    const contacts = createRecord("contacts");
    const inbox = createRecord("inbox");
    inbox.requires = ["contacts"];
    registry.plugins.push(contacts, inbox);
    const handled: string[] = [];
    createApi(inbox, {}).server.registerQueueHandler?.(
      "inbox_classify",
      async (payload) => {
        handled.push(String(payload.id));
      }
    );

    let overrides: Record<string, boolean> = { inbox: false };
    const handler = createGatedQueueHandlers({
      registry,
      resolveTenantPluginOverrides: async () => overrides,
    }).get("inbox_classify");
    const meta = { msgId: 1, readCount: 1 };

    await expect(
      handler?.({ id: "blocked-owner", tenant_id: "tenant-1" }, meta)
    ).rejects.toMatchObject({ reason: "plugin_tenant_disabled" });

    overrides = { contacts: false };
    await expect(
      handler?.({ id: "blocked-dependency", tenant_id: "tenant-1" }, meta)
    ).rejects.toMatchObject({ reason: "dependency_disabled" });

    overrides = {};
    await handler?.({ id: "allowed", tenant_id: "tenant-1" }, meta);

    expect(handled).toEqual(["allowed"]);
  });
});
