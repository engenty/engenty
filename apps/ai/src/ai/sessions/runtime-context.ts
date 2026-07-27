import {
  EngentyCoreClient,
  type EngentyPluginListItem,
  type EngentyToolContract,
  type EngentyWorkspaceContext,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import { type AiSessionScope, scopeAccessToken } from "./types.js";

export async function buildRuntimeContextInstructions(input: {
  scope: AiSessionScope;
  threadId: string;
}) {
  const lines = [
    "Engenty runtime context for this request:",
    `- thread_id: ${input.threadId}`,
    `- tenant_id: ${input.scope.tenantId}`,
    `- user_id: ${input.scope.userId}`,
  ];
  if (input.scope.tenantRole) {
    lines.push(`- tenant_role: ${input.scope.tenantRole}`);
  }
  lines.push(
    `- tenant_admin: ${input.scope.isTenantAdmin === true}`,
    `- superadmin: ${input.scope.isSuperAdmin === true}`
  );

  const userAccessToken = scopeAccessToken(input.scope)?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(userAccessToken && coreBaseUrl)) {
    lines.push(
      "- workspace_context: not loaded before this run; use engenty_tools_context if current tenant or user workspace details are needed.",
      "- active_modules: not loaded before this run; use engenty_tools_modules before choosing a module-specific tool."
    );
    return lines.join("\n");
  }

  try {
    const client = new EngentyCoreClient({ coreBaseUrl, userAccessToken });
    const workspace = await client.getWorkspaceContext();
    const [plugins, contracts] = await Promise.all([
      client.listPlugins(workspace.currentTenant?.id),
      client.listToolContracts(),
    ]);
    lines.push(
      `- current_user: ${formatCurrentUser(workspace.currentUser, workspace.userId)}`,
      `- current_tenant: ${formatTenant(workspace.currentTenant)}`,
      `- tenant_role: ${workspace.tenantRole ?? "none"}`,
      `- tenant_admin: ${workspace.isTenantAdmin}`,
      `- superadmin: ${workspace.isSuperAdmin}`,
      `- onboarded: ${workspace.onboarded}`,
      `- tenant_supported_locales: ${(workspace.tenantSupportedLocales ?? []).join(", ") || "none"}`
    );
    const toolSummaries = summarizeToolContractsByModule(contracts);
    const modules = plugins
      .filter(isActiveModulePlugin)
      .map((plugin) => {
        const summary = toolSummaries.get(plugin.id);
        return {
          baseUrl: `/mdl/${plugin.id}`,
          description: plugin.description,
          moduleId: plugin.id,
          name: plugin.name ?? plugin.id,
          toolCount: summary?.toolCount ?? 0,
          toolIds: summary?.toolIds ?? [],
        };
      })
      .sort((a, b) => a.moduleId.localeCompare(b.moduleId));

    if (modules.length === 0) {
      lines.push("- active_modules: none reported by core");
    } else {
      lines.push("- active_modules:");
      for (const module of modules.slice(0, 30)) {
        lines.push(`  Module: ${module.name}`);
        lines.push(`   - name: ${module.moduleId}`);
        if (module.description) {
          lines.push(
            `   - description: ${truncateForPrompt(module.description, 180)}`
          );
        }
        lines.push(`   - baseURL: ${module.baseUrl}`);
        if (module.toolIds.length > 0) {
          lines.push(`   - apiTools: ${module.toolIds.join(", ")}`);
        }
      }
      if (modules.length > 30) {
        lines.push(`  - ... ${modules.length - 30} more modules omitted`);
      }
    }
  } catch {
    lines.push(
      "- workspace_context: unavailable before this run; use engenty_tools_context if needed.",
      "- active_modules: unavailable before this run; use engenty_tools_modules if needed."
    );
  }

  return lines.join("\n");
}

function formatTenant(
  tenant: { id: string; name?: string; slug?: string } | null
) {
  if (!tenant) {
    return "none";
  }
  const label = tenant.name || tenant.slug || tenant.id;
  const suffix = [tenant.slug, tenant.id].filter(Boolean).join(", ");
  return suffix ? `${label} (${suffix})` : label;
}

function formatCurrentUser(
  user: EngentyWorkspaceContext["currentUser"] | undefined,
  fallbackUserId: string
) {
  if (!user) {
    return fallbackUserId;
  }
  const parts = [
    user.display_name ? `name=${user.display_name}` : null,
    user.email ? `email=${user.email}` : null,
    user.initials ? `initials=${user.initials}` : null,
    user.role ? `role=${user.role}` : null,
    `id=${user.id}`,
  ].filter(Boolean);
  return parts.join(", ");
}

function isActiveModulePlugin(plugin: EngentyPluginListItem) {
  const isModule =
    plugin.kind === "module" ||
    (plugin.provides ?? []).some(
      (capability) =>
        capability === `module.${plugin.id}` ||
        capability === `ui.route.module.${plugin.id}`
    );
  if (!isModule) {
    return false;
  }
  if (plugin.loaded === false || plugin.enabled === false) {
    return false;
  }
  if (
    plugin.tenantEnabled === false ||
    plugin.effectiveState?.tenantEnabled === false ||
    plugin.effectiveState?.globallyEnabled === false ||
    plugin.effectiveState?.allowed === false
  ) {
    return false;
  }
  return true;
}

function summarizeToolContractsByModule(contracts: EngentyToolContract[]) {
  const map = new Map<string, { toolCount: number; toolIds: string[] }>();
  for (const contract of contracts) {
    const moduleId = contract.moduleId ?? "core";
    const toolId =
      contract.toolId ?? contract.operationId ?? contract.methodName;
    if (!toolId) {
      continue;
    }
    const current = map.get(moduleId) ?? { toolCount: 0, toolIds: [] };
    current.toolCount++;
    current.toolIds.push(toolId);
    map.set(moduleId, current);
  }
  return map;
}

function truncateForPrompt(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
}
