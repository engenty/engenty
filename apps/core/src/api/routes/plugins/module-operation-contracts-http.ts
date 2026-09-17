/**
 * Contract discovery routes: what the authenticated principal may call.
 */
import { resolvePluginCapability } from "../../../plugins/capability-resolver.js";
import { buildOperationContracts } from "../../operation-contracts.js";
import { jsonApiError, jsonApiSuccess } from "../api-response.js";
import { requireAuth } from "./module-operation-auth.js";
import {
  type HonoGetContext,
  isCoreOwnedOperation,
  type OperationRoutesContext,
} from "./module-operation-shared.js";

export async function listAvailableOperationContracts(
  c: HonoGetContext,
  params: OperationRoutesContext & { moduleId?: string }
) {
  const authResult = await requireAuth(c, params.authProvider);
  if (authResult.error || !authResult.auth) {
    return authResult.error!;
  }
  const tenantPluginOverrides = params.resolveTenantPluginOverrides
    ? await params.resolveTenantPluginOverrides(authResult.auth.tenantId)
    : {};
  const contracts = buildOperationContracts(params.registry).filter(
    (contract) =>
      (params.moduleId ? contract.moduleId === params.moduleId : true) &&
      (isCoreOwnedOperation(contract.pluginId) ||
        resolvePluginCapability({
          tenantId: authResult.auth.tenantId,
          registry: params.registry,
          pluginId: contract.pluginId,
          capability: contract.operationId,
          contributionKind: "operation",
          registeredCapabilities: params.registry.moduleOperations
            .filter((item) => item.pluginId === contract.pluginId)
            .map((item) => item.operationId),
          tenantPluginOverrides,
        }).allowed)
  );
  return jsonApiSuccess(c, contracts);
}

export async function getAvailableOperationContract(
  c: HonoGetContext,
  params: OperationRoutesContext & {
    moduleId?: string;
    operationId: string;
    publicName: "Operation" | "Tool";
  }
) {
  const authResult = await requireAuth(c, params.authProvider);
  if (authResult.error || !authResult.auth) {
    return authResult.error!;
  }
  const contract = buildOperationContracts(params.registry).find(
    (item) => item.operationId === params.operationId
  );
  if (!contract) {
    return jsonApiError(c, 404, {
      message: `${params.publicName} contract not found`,
    });
  }
  if (params.moduleId && contract.moduleId !== params.moduleId) {
    return jsonApiError(c, 404, {
      message: `${params.publicName} contract not found for module`,
      details: {
        moduleId: params.moduleId,
        toolId: params.operationId,
      },
    });
  }
  const tenantPluginOverrides = params.resolveTenantPluginOverrides
    ? await params.resolveTenantPluginOverrides(authResult.auth.tenantId)
    : {};
  if (!isCoreOwnedOperation(contract.pluginId)) {
    const capabilityResolution = resolvePluginCapability({
      tenantId: authResult.auth.tenantId,
      registry: params.registry,
      pluginId: contract.pluginId,
      capability: contract.operationId,
      contributionKind: "operation",
      registeredCapabilities: params.registry.moduleOperations
        .filter((item) => item.pluginId === contract.pluginId)
        .map((item) => item.operationId),
      tenantPluginOverrides,
    });
    if (!capabilityResolution.allowed) {
      return jsonApiError(c, 403, {
        code: capabilityResolution.reason,
        message: `${params.publicName} contract unavailable`,
        details: {
          reason: capabilityResolution.reason,
          diagnostics: capabilityResolution.diagnostics,
        },
      });
    }
  }
  return jsonApiSuccess(c, contract);
}
