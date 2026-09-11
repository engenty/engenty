import type { ToolExecutionContext } from "@mastra/core/tools";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";

export const ENGENTY_TOOLS_CONTEXT_TOOL_ID = "engenty_tools_context";

export const engentyToolsContextTool = createTool({
  id: ENGENTY_TOOLS_CONTEXT_TOOL_ID,
  description:
    "Read tenant and user identity for the current authenticated request (current tenant, tenant role, admin flags, supported locales, and onboarding). This is tenant/user identity only — not Space context. Do not use it for current_space, mounted modules, or record facts; those come from the runtime current_space / space_mounted_* block.",
  inputSchema: z.object({}),
  execute: async (_input, context) => getEngentyToolsContext(context),
});

export function createEngentyToolsContextTool() {
  return engentyToolsContextTool;
}

export async function getEngentyToolsContext(
  contextOrClient:
    | ToolExecutionContext
    | ReturnType<typeof getCurrentEngentyToolsClient>
    | undefined
) {
  const client =
    contextOrClient && "ok" in contextOrClient
      ? contextOrClient
      : getCurrentEngentyToolsClient(contextOrClient);
  if (!client.ok) {
    return client;
  }
  try {
    const workspace = await client.client.getWorkspaceContext();
    return {
      ok: true,
      context: {
        canSwitchTenant: workspace.canSwitchTenant ?? false,
        currentTenant: workspace.currentTenant,
        isSuperAdmin: workspace.isSuperAdmin,
        isTenantAdmin: workspace.isTenantAdmin,
        onboarded: workspace.onboarded,
        tenantRole: workspace.tenantRole,
        tenantSupportedLocales: workspace.tenantSupportedLocales ?? [],
        userId: workspace.userId,
      },
      message:
        "Workspace context loaded for the current authenticated request.",
    };
  } catch (err) {
    return coreErrorToToolResult(err);
  }
}
