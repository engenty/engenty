import {
  listActiveAiRegistrations,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createGatedQueueHandlers } from "./queue-handler-gating";
import { createPluginRegistry, type PluginRecord } from "./registry";
import {
  startRegisteredServices,
  unloadOwnedRegistrations,
} from "./service-lifecycle";

const TARGET_AI_REGISTRATION_TEST_MODULE = "registry-target-ai";

afterEach(() => {
  unregisterAiRegistration(TARGET_AI_REGISTRATION_TEST_MODULE);
});

function createRecord(id: string): PluginRecord {
  return {
    id,
    source: `/plugins/${id}.ts`,
    cliCommands: [],
    dependencies: [],
    enabled: true,
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    services: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    testDataTypes: [],
    featureFlags: [],
    queues: [],
    loaded: true,
  };
}

describe("createPluginRegistry", () => {
  it("stores HTTP routes and blocks duplicates", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("r1");
    registry.plugins.push(record);
    const api = createApi(record, {});

    api.server.registerHttpRoute({
      method: "get",
      path: "/api/hello",
      responses: {
        200: { schema: z.object({ ok: z.boolean() }) },
      },
      handler: async () => ({ ok: true }),
    });
    api.server.registerHttpRoute({
      method: "get",
      path: "/api/hello",
      handler: async () => ({ ok: true }),
    });

    expect(registry.httpRoutes).toHaveLength(1);
    expect(registry.httpRoutes[0].receiptId).toBe(
      "r1:server.httpRoute:GET /api/hello"
    );
    expect(registry.httpRoutes[0].sourceInfo).toMatchObject({
      pluginId: "r1",
      source: "/plugins/r1.ts",
      registrationKind: "server.httpRoute",
      generationId: 1,
    });
    expect(
      registry.diagnostics.some((d) => d.message.includes("http route already"))
    ).toBe(true);
    expect(registry.diagnostics[0]).toMatchObject({
      code: "plugin.registration.duplicate_route",
      sourceInfo: {
        pluginId: "r1",
        registrationKind: "server.httpRoute",
      },
    });
  });

  it("registers target server operations without gateway method entries", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("contacts");
    registry.plugins.push(record);
    const api = createApi(record, {});
    const receipt = api.server.registerOperation({
      operationId: "contacts_get",
      moduleId: "contacts",
      requiredCapabilities: ["module.contacts.read", "module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
      dryRunSupported: true,
      handler: async () => ({ id: "c1" }),
    });

    expect(receipt?.id).toBe("contacts:server.moduleOperation:contacts_get");
    expect(registry.moduleOperations).toHaveLength(1);
    expect(registry.gatewayMethods).toHaveLength(0);
    expect(api.server.hasOperation("contacts_get")).toBe(true);
    expect(api.server.hasOperation("contacts_nonexistent")).toBe(false);
    expect(registry.moduleOperations[0]).toMatchObject({
      pluginId: "contacts",
      operationId: "contacts_get",
      methodName: "contacts_get",
      receiptId: "contacts:server.moduleOperation:contacts_get",
      sourceInfo: {
        pluginId: "contacts",
        registrationKind: "server.moduleOperation",
      },
      operation: {
        moduleId: "contacts",
        operationId: "contacts_get",
        requiredCapabilities: ["module.contacts.read"],
        riskLevel: "low",
        idempotent: true,
        dryRunSupported: true,
        requiresApproval: false,
      },
    });
    await expect(
      registry.moduleOperations[0].handler(
        {},
        {
          config: {},
          pluginConfig: {},
          logger: {
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
          },
          resolvePath: (p) => p,
        }
      )
    ).resolves.toEqual({ id: "c1" });
  });

  it("exposes target server operation availability", () => {
    const { createApi, registry } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const contactsRecord = createRecord("contacts");
    const invoicesRecord = createRecord("invoices");
    registry.plugins.push(contactsRecord, invoicesRecord);

    const contactsApi = createApi(contactsRecord, {});
    contactsApi.server.registerOperation({
      operationId: "contacts_get",
      moduleId: "contacts",
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
      handler: async () => ({ id: "c1" }),
    });

    const invoicesApi = createApi(invoicesRecord, {});

    expect(invoicesApi.server.hasOperation("contacts_get")).toBe(true);
    expect(invoicesApi.server.hasOperation("contacts_nonexistent")).toBe(false);
  });

  it("exposes target server AI registration", async () => {
    const { createApi, registry } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord(TARGET_AI_REGISTRATION_TEST_MODULE);
    registry.plugins.push(record);
    const api = createApi(record, {});

    api.server.registerAiRegistration({
      agents: [],
      module_id: TARGET_AI_REGISTRATION_TEST_MODULE,
      triggers: [],
    });

    expect(listActiveAiRegistrations()).toContainEqual(
      expect.objectContaining({
        module_id: TARGET_AI_REGISTRATION_TEST_MODULE,
      })
    );
    expect(registry.aiRegistrations).toEqual([
      expect.objectContaining({
        generationId: 1,
        moduleId: TARGET_AI_REGISTRATION_TEST_MODULE,
        pluginId: TARGET_AI_REGISTRATION_TEST_MODULE,
      }),
    ]);

    const removal = await registry.removeOwnedRegistrations?.(
      TARGET_AI_REGISTRATION_TEST_MODULE
    );

    expect(removal?.removed.aiRegistrations).toBe(1);
    expect(registry.aiRegistrations).toEqual([]);
    expect(listActiveAiRegistrations()).not.toContainEqual(
      expect.objectContaining({
        module_id: TARGET_AI_REGISTRATION_TEST_MODULE,
      })
    );
  });

  it("exposes target server storage service through the existing host storage provider", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      getDatabaseAdapter: () =>
        ({
          rpc: async () => null,
          from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }) as never,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("pdf-templates");
    registry.plugins.push(record);
    const api = createApi(record, {});

    expect(api.server.getStorageService?.("files")).toBeTruthy();
  });

  it("reports duplicate target server operations as operation duplicates", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("contacts");
    registry.plugins.push(record);
    const api = createApi(record, {});
    api.server.registerOperation({
      operationId: "contacts_get",
      handler: async () => ({ id: "c1" }),
    });
    const duplicateReceipt = api.server.registerOperation({
      operationId: "contacts_get",
      handler: async () => ({ id: "c2" }),
    });

    expect(duplicateReceipt).toBeUndefined();
    expect(registry.moduleOperations).toHaveLength(1);
    expect(registry.gatewayMethods).toHaveLength(0);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.registration.duplicate_operation",
        pluginId: "contacts",
        sourceInfo: expect.objectContaining({
          registrationKind: "server.moduleOperation",
        }),
      })
    );
  });

  it("stores services and blocks duplicate IDs", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("r3");
    registry.plugins.push(record);
    const api = createApi(record, {});

    api.server.registerService({
      id: "pdf-service",
      start: async () => {},
    });
    api.server.registerService({
      id: "pdf-service",
      start: async () => {},
    });

    expect(registry.services).toHaveLength(1);
    expect(registry.services[0].receiptId).toBe(
      "r3:server.service:pdf-service"
    );
    expect(
      registry.diagnostics.some((d) => d.message.includes("service already"))
    ).toBe(true);
    expect(registry.diagnostics[0].code).toBe(
      "plugin.registration.duplicate_service"
    );
  });

  it("records service start diagnostics and stale generation warnings", async () => {
    const logs: string[] = [];
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      generationId: 3,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: (m) => logs.push(m),
        error: (m) => logs.push(m),
        debug: () => {},
      },
    });

    const record = createRecord("services");
    record.generationId = registry.generationId;
    registry.plugins.push(record);
    const api = createApi(record, {});
    api.server.registerService({
      id: "throws-sync",
      start: () => {
        throw new Error("boom");
      },
    });
    api.server.registerService({
      id: "starts-async",
      start: async () => {},
    });

    const pending = startRegisteredServices(registry, {
      config: {},
      dataDir: "/tmp",
      logger: {
        info: () => {},
        warn: (m) => logs.push(m),
        error: (m) => logs.push(m),
        debug: () => {},
      },
      pluginConfig: {},
      resolvePath: (p) => p,
    });
    registry.generationId = 4;
    record.generationId = 4;
    await Promise.all(pending);

    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.service.start_failed"
    );
    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.runtime.stale_generation"
    );
    expect(logs.some((message) => message.includes("throws-sync"))).toBe(true);
  });

  it("gates service startup by owner and required dependency state", async () => {
    const started: string[] = [];
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const allowedRecord = createRecord("allowed");
    const disabledRecord = createRecord("disabled");
    disabledRecord.enabled = false;
    const dependencyRecord = createRecord("contacts");
    dependencyRecord.enabled = false;
    const dependentRecord = createRecord("dependent");
    dependentRecord.requires = ["contacts"];
    registry.plugins.push(
      allowedRecord,
      disabledRecord,
      dependencyRecord,
      dependentRecord
    );

    createApi(allowedRecord, {}).server.registerService({
      id: "allowed-service",
      start: () => {
        started.push("allowed");
      },
    });
    createApi(disabledRecord, {}).server.registerService({
      id: "disabled-service",
      start: () => {
        started.push("disabled");
      },
    });
    createApi(dependentRecord, {}).server.registerService({
      id: "dependent-service",
      start: () => {
        started.push("dependent");
      },
    });

    const pending = startRegisteredServices(registry, {
      config: {},
      dataDir: "/tmp",
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      pluginConfig: {},
      resolvePath: (p) => p,
    });
    await Promise.all(pending);

    expect(started).toEqual(["allowed"]);
    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.capability.plugin_globally_disabled"
    );
    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.dependency.disabled_required"
    );
  });

  it("stops reloadable services before unloading owned registrations", async () => {
    const stopped: string[] = [];
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      generationId: 5,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const contactsRecord = createRecord("contacts");
    contactsRecord.generationId = registry.generationId;
    const invoicesRecord = createRecord("invoices");
    invoicesRecord.generationId = registry.generationId;
    registry.plugins.push(contactsRecord, invoicesRecord);
    const contactsApi = createApi(contactsRecord, {});
    const invoicesApi = createApi(invoicesRecord, {});
    contactsApi.server.registerService({
      id: "contacts-sync",
      start: async () => {},
      stop: async () => {
        stopped.push("contacts-sync");
      },
    });
    contactsApi.server.registerHttpRoute({
      method: "get",
      path: "/api/contacts",
      handler: async () => [],
    });
    invoicesApi.server.registerService({
      id: "invoices-sync",
      start: async () => {},
      stop: async () => {
        stopped.push("invoices-sync");
      },
    });

    const result = await unloadOwnedRegistrations(registry, "contacts", {
      config: {},
      dataDir: "/tmp",
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      pluginConfig: {},
      resolvePath: (p) => p,
    });

    expect(result).toMatchObject({
      blocked: false,
      pluginId: "contacts",
      serviceStop: {
        stopped: 1,
        blocked: false,
      },
      removal: {
        removed: {
          httpRoutes: 1,
          services: 1,
        },
      },
    });
    expect(stopped).toEqual(["contacts-sync"]);
    expect(registry.services).toHaveLength(1);
    expect(registry.services[0].pluginId).toBe("invoices");
  });

  it("blocks owner unload when a generic disposer fails", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      generationId: 5,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const contactsRecord = createRecord("contacts");
    contactsRecord.generationId = registry.generationId;
    registry.plugins.push(contactsRecord);
    const contactsApi = createApi(contactsRecord, {});
    contactsApi.server.registerHttpRoute({
      method: "get",
      path: "/api/contacts",
      handler: async () => [],
    });
    registry.httpRoutes[0] = {
      ...registry.httpRoutes[0],
      dispose: () => {
        throw new Error("route dispose exploded");
      },
    } as (typeof registry.httpRoutes)[number] & {
      dispose: () => void;
    };

    const result = await unloadOwnedRegistrations(registry, "contacts", {
      config: {},
      dataDir: "/tmp",
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      pluginConfig: {},
      resolvePath: (p) => p,
    });

    expect(result.blocked).toBe(true);
    expect(result.removal).toMatchObject({
      blocked: true,
      disposeFailureCount: 1,
      disposeFailures: [
        expect.objectContaining({
          kind: "server.httpRoute",
          message: "route dispose exploded",
        }),
      ],
      totalRemoved: 0,
    });
    expect(registry.httpRoutes).toHaveLength(1);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.dispose.failed",
        pluginId: "contacts",
      })
    );
  });

  it("blocks unload when an owned service is non-reloadable", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      generationId: 6,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("contacts");
    record.generationId = registry.generationId;
    registry.plugins.push(record);
    const api = createApi(record, {});
    api.server.registerService({
      id: "contacts-watch",
      reloadable: false,
      start: async () => {},
    });
    api.server.registerHttpRoute({
      method: "get",
      path: "/api/contacts",
      handler: async () => [],
    });

    const result = await unloadOwnedRegistrations(registry, "contacts", {
      config: {},
      dataDir: "/tmp",
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      pluginConfig: {},
      resolvePath: (p) => p,
    });

    expect(result.blocked).toBe(true);
    expect(result.removal).toBeUndefined();
    expect(result.serviceStop.nonReloadable).toBe(1);
    expect(registry.httpRoutes).toHaveLength(1);
    expect(registry.services).toHaveLength(1);
    expect(registry.diagnostics[0]).toMatchObject({
      code: "plugin.service.non_reloadable",
      pluginId: "contacts",
    });
  });

  it("tracks runtime generation and removes owned registrations by plugin id", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      generationId: 7,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const contactsRecord = createRecord("contacts");
    contactsRecord.generationId = registry.generationId;
    const invoicesRecord = createRecord("invoices");
    invoicesRecord.generationId = registry.generationId;
    registry.plugins.push(contactsRecord, invoicesRecord);
    const contactsApi = createApi(contactsRecord, {});
    const invoicesApi = createApi(invoicesRecord, {});

    contactsApi.server.registerHttpRoute({
      method: "get",
      path: "/api/contacts",
      handler: async () => [],
    });
    contactsApi.server.registerOperation({
      operationId: "contacts_list",
      moduleId: "contacts",
      handler: async () => [],
    });
    contactsApi.server.registerService({
      id: "contacts-sync",
      start: async () => {},
    });
    contactsApi.server.registerFeatureFlags([
      {
        key: "contacts.bulk_actions",
        namespace: "contacts",
        default: true,
        pluginId: "ignored",
      },
    ]);
    contactsApi.server.registerQueue?.({
      name: "contacts_enrich",
      label: "Enrich",
    });
    contactsApi.server.registerQueueHandler?.(
      "contacts_enrich",
      async () => {}
    );
    contactsApi.server.registerTestDataType({
      meta: {
        module_id: "contacts",
        data_type: "people",
        description: "People",
        recordSchema: z.object({ id: z.string() }),
        schemaDescription: "id",
      },
      persist: async () => 0,
    });

    invoicesApi.server.registerHttpRoute({
      method: "get",
      path: "/api/invoices",
      handler: async () => [],
    });

    expect(registry.generationId).toBe(7);
    expect(registry.httpRoutes[0].sourceInfo?.generationId).toBe(7);
    expect(registry.httpRoutes[0].receiptId).toBe(
      "contacts:server.httpRoute:GET /api/contacts"
    );

    const result = await registry.removeOwnedRegistrations?.("contacts");

    expect(result).toMatchObject({
      generationId: 7,
      blocked: false,
      pluginId: "contacts",
      disposeFailureCount: 0,
      removed: {
        featureFlags: 1,
        gatewayMethods: 0,
        httpRoutes: 1,
        moduleOperations: 1,
        queueDefinitions: 1,
        queueHandlers: 1,
        services: 1,
        testDataTypes: 1,
      },
      totalRemoved: 7,
    });
    expect(registry.httpRoutes).toHaveLength(1);
    expect(registry.httpRoutes[0].pluginId).toBe("invoices");
    expect(registry.gatewayMethods).toHaveLength(0);
    expect(registry.moduleOperations).toHaveLength(0);
    expect(registry.services).toHaveLength(0);
    expect(registry.featureFlags).toHaveLength(0);
    expect(registry.queueDefinitions).toHaveLength(0);
    expect(registry.queueHandlers.size).toBe(0);
    expect(contactsRecord.httpRoutes).toEqual([]);
    expect(contactsRecord.gatewayMethods).toEqual([]);
    expect(contactsRecord.services).toEqual([]);
  });

  it("supports checking and calling registered module operations", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const contactsRecord = createRecord("contacts");
    registry.plugins.push(contactsRecord);
    const contactsApi = createApi(contactsRecord, {
      source: "contacts-config",
    });
    contactsApi.server.registerOperation({
      operationId: "contacts_get",
      moduleId: "contacts",
      handler: async () => ({ id: "c1", display_name: "Acme" }),
    });

    const invoicesRecord = createRecord("invoices");
    registry.plugins.push(invoicesRecord);
    const invoicesApi = createApi(invoicesRecord, {});

    expect(invoicesApi.server.hasOperation("contacts_get")).toBe(true);
    expect(invoicesApi.server.hasOperation("contacts_nonexistent")).toBe(false);

    const found = await invoicesApi.server.callGatewayMethod("contacts_get", {
      id: "c1",
    });
    expect(found).toEqual({ id: "c1", display_name: "Acme" });

    const missing = await invoicesApi.server.callGatewayMethod(
      "contacts_nonexistent",
      {
        id: "c1",
      }
    );
    expect(missing).toBeNull();
  });

  it("skips stale-generation module operations and records diagnostics", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      generationId: 1,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const contactsRecord = createRecord("contacts");
    const invoicesRecord = createRecord("invoices");
    registry.plugins.push(contactsRecord, invoicesRecord);
    let callCount = 0;
    createApi(contactsRecord, {}).server.registerOperation({
      operationId: "contacts_get",
      moduleId: "contacts",
      handler: async () => {
        callCount += 1;
        return { id: "c1" };
      },
    });
    registry.generationId = 2;
    contactsRecord.generationId = 2;

    const result = await createApi(invoicesRecord, {}).server.callGatewayMethod(
      "contacts_get",
      {}
    );

    expect(result).toBeNull();
    expect(callCount).toBe(0);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.runtime.stale_generation",
        pluginId: "contacts",
      })
    );
  });

  it("stores feature flag definitions and dedupes by key", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const r1 = createRecord("contacts");
    registry.plugins.push(r1);
    const api1 = createApi(r1, {});
    api1.server.registerFeatureFlags([
      {
        key: "contacts.organisation_accounts",
        namespace: "contacts",
        default: true,
        pluginId: "contacts",
      },
      {
        key: "contacts.organisation_accounts",
        namespace: "contacts",
        default: false,
        pluginId: "other",
      },
    ]);

    expect(registry.featureFlags).toHaveLength(1);
    expect(registry.featureFlags[0].default).toBe(true);
    expect(registry.featureFlags[0].pluginId).toBe("contacts");
  });

  it("registers target server feature flags with provenance receipts", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("expenses");
    registry.plugins.push(record);
    const api = createApi(record, {});
    const receipts = api.server.registerFeatureFlags([
      {
        key: "expenses.enabled",
        namespace: "expenses",
        default: true,
        labelKey: "expenses:featureFlags.enabled",
        pluginId: "ignored-by-target-api",
      },
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      id: "expenses:server.featureFlag:expenses.enabled",
      pluginId: "expenses",
      generationId: 1,
      kind: "server.featureFlag",
      sourceInfo: {
        pluginId: "expenses",
        registrationKind: "server.featureFlag",
      },
    });
    expect(registry.featureFlags).toEqual([
      {
        key: "expenses.enabled",
        namespace: "expenses",
        default: true,
        labelKey: "expenses:featureFlags.enabled",
        pluginId: "expenses",
      },
    ]);
    expect(record.featureFlags).toEqual(["expenses.enabled"]);
  });

  it("stores test data types and blocks duplicate module:data_type", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("time-tracking");
    registry.plugins.push(record);
    const api = createApi(record, {});

    api.server.registerTestDataType({
      meta: {
        module_id: "time-tracking",
        data_type: "time_entries",
        description: "Time entries",
        recordSchema: z.object({ date: z.string(), hours: z.number() }),
        schemaDescription: "date, hours",
      },
      persist: async () => 0,
    });
    api.server.registerTestDataType({
      meta: {
        module_id: "time-tracking",
        data_type: "time_entries",
        description: "Duplicate",
        recordSchema: z.object({ date: z.string() }),
        schemaDescription: "date",
      },
      persist: async () => 0,
    });

    expect(registry.testDataTypes).toHaveLength(1);
    expect(registry.testDataTypes[0].registration.meta.data_type).toBe(
      "time_entries"
    );
    expect(
      registry.diagnostics.some((d) =>
        d.message.includes("test data type already registered")
      )
    ).toBe(true);
  });

  it("registers target server test data types with provenance", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("team");
    registry.plugins.push(record);
    const api = createApi(record, {});

    const receipt = api.server.registerTestDataType({
      meta: {
        module_id: "team",
        data_type: "team",
        description: "Team members",
        recordSchema: z.object({ full_name: z.string() }),
        schemaDescription: "full_name",
      },
      persist: async () => 0,
    });

    expect(receipt?.id).toBe("team:server.testDataType:team:team");
    expect(registry.testDataTypes).toHaveLength(1);
    expect(registry.testDataTypes[0]).toMatchObject({
      pluginId: "team",
      receiptId: "team:server.testDataType:team:team",
      sourceInfo: {
        pluginId: "team",
        registrationKind: "server.testDataType",
      },
    });
    expect(registry.testDataTypes[0].registration.meta).toMatchObject({
      module_id: "team",
      data_type: "team",
    });
  });

  it("stores profile and result policies", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("invoices");
    registry.plugins.push(record);
    const api = createApi(record, {});

    api.server.registerProfilePolicy(() => null);
    api.server.registerResultPolicy(() => null);

    expect(registry.profilePolicies).toHaveLength(1);
    expect(registry.resultPolicies).toHaveLength(1);
    expect(registry.profilePolicies?.[0]?.pluginId).toBe("invoices");
    expect(registry.profilePolicies?.[0]?.pluginId).toBe("invoices");
    expect(registry.resultPolicies?.[0]?.pluginId).toBe("invoices");
  });

  it("stores queue definitions and blocks duplicates", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("inbox");
    registry.plugins.push(record);
    const api = createApi(record, {});

    api.server.registerQueue?.({
      name: "inbox_download_attachments",
      label: "Download",
      color: "bg-blue-500/10 text-blue-600",
    });
    api.server.registerQueue?.({
      name: "inbox_classify",
      label: "Classify",
    });
    // Duplicate
    api.server.registerQueue?.({
      name: "inbox_download_attachments",
      label: "Download (dup)",
    });

    expect(registry.queueDefinitions).toHaveLength(2);
    expect(registry.queueDefinitions[0].queue.name).toBe(
      "inbox_download_attachments"
    );
    expect(registry.queueDefinitions[0].queue.label).toBe("Download");
    expect(registry.queueDefinitions[0].pluginId).toBe("inbox");
    expect(registry.queueDefinitions[0].receiptId).toBe(
      "inbox:server.queue:inbox_download_attachments"
    );
    expect(registry.queueDefinitions[0].sourceInfo).toMatchObject({
      pluginId: "inbox",
      registrationKind: "server.queue",
    });
    expect(registry.queueDefinitions[1].queue.name).toBe("inbox_classify");
    expect(record.queues).toEqual([
      "inbox_download_attachments",
      "inbox_classify",
    ]);
    expect(
      registry.diagnostics.some((d) =>
        d.message.includes("queue already registered")
      )
    ).toBe(true);
    expect(registry.diagnostics[0].code).toBe(
      "plugin.registration.duplicate_queue"
    );
  });

  it("stores queue handlers with plugin ownership metadata", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("inbox");
    registry.plugins.push(record);
    const api = createApi(record, {});
    const handled: string[] = [];

    api.server.registerQueueHandler?.("inbox_classify", async (payload) => {
      handled.push(String(payload.id));
    });

    const entry = registry.queueHandlers.get("inbox_classify");
    expect(entry).toMatchObject({
      pluginId: "inbox",
      receiptId: "inbox:server.queueHandler:inbox_classify",
      sourceInfo: {
        pluginId: "inbox",
        registrationKind: "server.queueHandler",
      },
    });

    await entry?.handler({ id: "msg_1" }, { msgId: 1, readCount: 1 });
    expect(handled).toEqual(["msg_1"]);
  });

  it("gates queue handlers by tenant owner and dependency state", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    const contactsRecord = createRecord("contacts");
    const inboxRecord = createRecord("inbox");
    inboxRecord.requires = ["contacts"];
    registry.plugins.push(contactsRecord, inboxRecord);
    const handled: string[] = [];
    createApi(inboxRecord, {}).server.registerQueueHandler?.(
      "inbox_classify",
      async (payload) => {
        handled.push(String(payload.id));
      }
    );

    let overrides: Record<string, boolean> = { inbox: false };
    const handlers = createGatedQueueHandlers({
      registry,
      resolveTenantPluginOverrides: async () => overrides,
    });
    const handler = handlers.get("inbox_classify");
    const meta = { msgId: 1, readCount: 1 };

    await expect(
      handler?.({ id: "blocked-owner", tenant_id: "tenant-1" }, meta)
    ).rejects.toMatchObject({
      reason: "plugin_tenant_disabled",
    });

    overrides = { contacts: false };
    await expect(
      handler?.({ id: "blocked-dependency", tenant_id: "tenant-1" }, meta)
    ).rejects.toMatchObject({
      reason: "dependency_disabled",
    });

    overrides = {};
    await handler?.({ id: "allowed", tenant_id: "tenant-1" }, meta);

    expect(handled).toEqual(["allowed"]);
    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.capability.plugin_tenant_disabled"
    );
    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.dependency.disabled_required"
    );
  });

  it("skips stale-generation queued work and records diagnostics", async () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      generationId: 1,
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    const inboxRecord = createRecord("inbox");
    registry.plugins.push(inboxRecord);
    const handled: string[] = [];
    createApi(inboxRecord, {}).server.registerQueueHandler?.(
      "inbox_classify",
      async (payload) => {
        handled.push(String(payload.id));
      }
    );
    const handlers = createGatedQueueHandlers({ registry });
    registry.generationId = 2;
    inboxRecord.generationId = 2;

    await expect(
      handlers.get("inbox_classify")?.(
        { id: "old-work" },
        { msgId: 1, readCount: 1 }
      )
    ).rejects.toMatchObject({
      name: "QueueStaleGenerationError",
    });

    expect(handled).toEqual([]);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.runtime.stale_generation",
        pluginId: "inbox",
      })
    );
  });
});
