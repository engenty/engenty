import type {
  PluginGatewayMethod,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerPdfTemplatesGatewayMethods } from "./gateway-methods.js";

function makeMockApi() {
  const gatewayMethods: PluginGatewayMethod[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const server = {
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
  } as Pick<PluginServerApi, "registerOperation">;

  return { gatewayMethods, server, serverOperations };
}

function getOperation(
  operations: PluginServerOperation[],
  operationId: string
) {
  const operation = operations.find(
    (candidate) => candidate.operationId === operationId
  );
  if (!operation) {
    throw new Error(`operation not found: ${operationId}`);
  }
  return operation;
}

const noPreview = {
  buildPreview: async () => ({
    input_schema_json: null,
    rendered_xml: "<Document />",
    template_data: {},
  }),
};

describe("registerPdfTemplatesGatewayMethods", () => {
  it("registers the full template lifecycle, not just the read", () => {
    const { gatewayMethods, server, serverOperations } = makeMockApi();

    registerPdfTemplatesGatewayMethods(
      server,
      {
        getDefaultTemplate: async () => null,
        getTemplateById: async () => null,
      } as any,
      noPreview as any
    );

    expect(gatewayMethods).toEqual([]);
    expect(serverOperations.map((operation) => operation.operationId)).toEqual([
      "pdf_templates_list",
      "pdf_templates_get",
      "pdf_templates_preview",
      "pdf_templates_create",
      "pdf_templates_update",
      "pdf_templates_delete",
    ]);
    expect(getOperation(serverOperations, "pdf_templates_get")).toMatchObject({
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.read"],
      riskLevel: "low",
      idempotent: true,
      dryRunSupported: false,
      requiresApproval: false,
      spacePolicy: { kind: "tenant_shared" },
    });
    expect(
      serverOperations.every(
        (operation) => operation.spacePolicy?.kind === "tenant_shared"
      )
    ).toBe(true);
  });

  it("gates every write behind approval and leaves the reads open", () => {
    // Templates are what the tenant's invoices are printed from; preview has to
    // stay ungated or the check-before-you-write loop needs an approval per try.
    const { server, serverOperations } = makeMockApi();
    registerPdfTemplatesGatewayMethods(
      server,
      {
        getDefaultTemplate: async () => null,
        getTemplateById: async () => null,
      } as any,
      noPreview as any
    );

    expect(
      Object.fromEntries(
        serverOperations.map((operation) => [
          operation.operationId,
          operation.requiresApproval,
        ])
      )
    ).toEqual({
      pdf_templates_create: true,
      pdf_templates_delete: true,
      pdf_templates_get: false,
      pdf_templates_list: false,
      pdf_templates_preview: false,
      pdf_templates_update: true,
    });
  });

  it("preserves id and default template handler routing", async () => {
    const calls: string[] = [];
    const { server, serverOperations } = makeMockApi();

    registerPdfTemplatesGatewayMethods(
      server,
      {
        getTemplateById: async (id: string) => {
          calls.push(`id:${id}`);
          return null;
        },
        getDefaultTemplate: async (moduleKey: string) => {
          calls.push(`default:${moduleKey}`);
          return null;
        },
      } as any,
      noPreview as any
    );

    const operation = getOperation(serverOperations, "pdf_templates_get");
    const ctx = {
      auth: { tenantId: "tenant-1", scopeId: "default", principalId: "user-1" },
    } as any;

    await operation.handler({ id: "template-1" }, ctx);
    await operation.handler({ module_key: "offers", use_default: true }, ctx);

    expect(calls).toEqual(["id:template-1", "default:offers"]);
  });

  it("patches only what it was given and fails loudly on a missing template", async () => {
    const patches: unknown[] = [];
    const { server, serverOperations } = makeMockApi();
    registerPdfTemplatesGatewayMethods(
      server,
      {
        getDefaultTemplate: async () => null,
        getTemplateById: async () => null,
        updateTemplate: async (id: string, patch: unknown) => {
          patches.push({ id, patch });
          return id === "known" ? ({ id } as never) : null;
        },
      } as any,
      noPreview as any
    );

    const ctx = {
      auth: { principalId: "user-1", scopeId: "default", tenantId: "t1" },
    } as any;
    const update = getOperation(serverOperations, "pdf_templates_update");

    await update.handler({ id: "known", patch: { name: "Renamed" } }, ctx);
    // A name-only patch must not carry document_template through as null; that
    // would reset custom markup to the module default.
    expect(patches).toEqual([{ id: "known", patch: { name: "Renamed" } }]);

    await expect(
      update.handler({ id: "gone", patch: { name: "x" } }, ctx)
    ).rejects.toThrow(/not found/);
  });
});
