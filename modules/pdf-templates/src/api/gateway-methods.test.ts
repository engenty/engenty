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

describe("registerPdfTemplatesGatewayMethods", () => {
  it("registers PDF template operations through the server operation API", () => {
    const { gatewayMethods, server, serverOperations } = makeMockApi();

    registerPdfTemplatesGatewayMethods(server, {
      getTemplateById: async () => null,
      getDefaultTemplate: async () => null,
    } as any);

    expect(gatewayMethods).toEqual([]);
    expect(serverOperations.map((operation) => operation.operationId)).toEqual([
      "pdf_templates_get",
    ]);
    expect(getOperation(serverOperations, "pdf_templates_get")).toMatchObject({
      moduleId: "pdf-templates",
      requiredCapabilities: ["module.pdf-templates.read"],
      riskLevel: "low",
      idempotent: true,
      dryRunSupported: false,
      requiresApproval: false,
    });
  });

  it("preserves id and default template handler routing", async () => {
    const calls: string[] = [];
    const { server, serverOperations } = makeMockApi();

    registerPdfTemplatesGatewayMethods(server, {
      getTemplateById: async (id: string) => {
        calls.push(`id:${id}`);
        return null;
      },
      getDefaultTemplate: async (moduleKey: string) => {
        calls.push(`default:${moduleKey}`);
        return null;
      },
    } as any);

    const operation = getOperation(serverOperations, "pdf_templates_get");
    const ctx = {
      auth: { tenantId: "tenant-1", scopeId: "default", principalId: "user-1" },
    } as any;

    await operation.handler({ id: "template-1" }, ctx);
    await operation.handler({ module_key: "offers", use_default: true }, ctx);

    expect(calls).toEqual(["id:template-1", "default:offers"]);
  });
});
