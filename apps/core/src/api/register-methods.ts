import type {
  EngentyApiCatalogInput,
  EngentyApiCatalogResult,
} from "@engenty/ai-core";
import type {
  PluginAuthContext,
  PluginGatewayMethod,
} from "@engenty/plugin-sdk";
import type { PluginRegistry } from "../plugins/registry.js";
import { buildEngentyApiCatalogMethod } from "./methods/api-catalog/catalog-method.js";
import {
  buildChatThreadIndexHealthMethod,
  buildChatThreadSearchMethod,
} from "./methods/core-ai-methods-removed.js";
import { buildCoreUsersCreateInTenantMethod } from "./methods/core-users/create-in-tenant-method.js";

function registerCoreMethodIfAbsent(
  registry: PluginRegistry,
  method: PluginGatewayMethod
): void {
  const methodName = method.name.trim();
  if (!methodName) {
    return;
  }

  if (
    !registry.gatewayMethods.some((entry) => entry.method.name === methodName)
  ) {
    registry.gatewayMethods.push({
      pluginId: "core",
      method,
      source: "core",
      pluginConfig: {},
    });
  }

  if (!method.operation) {
    return;
  }
  const operationId = method.operation.operationId?.trim() || methodName;
  if (registry.moduleOperations.some((e) => e.operationId === operationId)) {
    return;
  }
  const op = method.operation;
  const normalizedOperation = {
    moduleId: op.moduleId?.trim() || "core",
    operationId,
    requiredCapabilities: Array.from(
      new Set(
        (op.requiredCapabilities ?? [])
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ),
    riskLevel: op.riskLevel ?? "medium",
    idempotent: op.idempotent ?? false,
    dryRunSupported: op.dryRunSupported ?? false,
    requiresApproval: op.requiresApproval ?? false,
  } as const;
  registry.moduleOperations.push({
    pluginId: "core",
    operationId,
    methodName,
    description: method.description,
    handler: method.handler,
    inputSchema: method.inputSchema,
    outputSchema: method.outputSchema,
    operation: normalizedOperation,
    source: "core",
    pluginConfig: {},
    summary: method.summary,
  });
}

/**
 * Registers core-owned handlers on `registry.gatewayMethods` (plugin-sdk).
 * Methods that include `operation` metadata are also registered on
 * `registry.moduleOperations` so `hasOperation` / unified dispatch apply.
 * Invoked in-process via `createMethodInvoker` from `method-invoker.ts`;
 * exposed to agents and plugins as `callGatewayMethod` in the runtime.
 */
export function registerCoreMethods(
  registry: PluginRegistry,
  config: Record<string, unknown>,
  helpers: {
    getApiCatalog: (
      input: EngentyApiCatalogInput,
      auth?: PluginAuthContext
    ) => EngentyApiCatalogResult | Promise<EngentyApiCatalogResult>;
  }
): void {
  registerCoreMethodIfAbsent(
    registry,
    buildCoreUsersCreateInTenantMethod(config)
  );
  registerCoreMethodIfAbsent(
    registry,
    buildEngentyApiCatalogMethod(helpers.getApiCatalog)
  );
  registerCoreMethodIfAbsent(registry, buildChatThreadIndexHealthMethod());
  registerCoreMethodIfAbsent(registry, buildChatThreadSearchMethod());
}
