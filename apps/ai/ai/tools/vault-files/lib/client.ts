import type { ToolExecutionContext } from "@mastra/core/tools";
import { getEngentyCoreBaseUrlFromEnv } from "../../../../src/ai/core-http-client.js";
import { createEngentyCoreFileStorageClient } from "../../../../src/ai/workspace/core-file-storage-client.js";
import { getCurrentEngentyToolsClient } from "../../engenty-tools/lib/client.js";
import { resolveEngentyToolsRunContext } from "../../engenty-tools/lib/run-context.js";
import { resolveScopedVaultKey } from "./key-scope.js";

export async function getVaultFileStorageClient(
  executionContext?: ToolExecutionContext
) {
  const toolsClient = getCurrentEngentyToolsClient(executionContext);
  if (!toolsClient.ok) {
    return toolsClient;
  }

  const workspace = await toolsClient.client.getWorkspaceContext();
  const tenantId = workspace.currentTenant?.id?.trim();
  if (!tenantId) {
    return {
      ok: false as const,
      code: "tenant_required",
      message: "Vault file tools require an active tenant context.",
    };
  }

  const runContext = resolveEngentyToolsRunContext(executionContext);
  const coreBaseUrl = runContext.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  const accessToken = runContext.accessToken?.trim();
  if (!(coreBaseUrl && accessToken)) {
    return {
      ok: false as const,
      code: "service_unavailable",
      message: "Vault file tools are unavailable for this run.",
    };
  }

  return {
    ok: true as const,
    client: createEngentyCoreFileStorageClient({
      bucket: "files",
      coreBaseUrl,
      fetchImpl: runContext.fetchImpl,
      accessToken,
    }),
    resolveKey(key: string) {
      return resolveScopedVaultKey(tenantId, key);
    },
    tenantId,
  };
}
