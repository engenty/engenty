import {
  EngentyCoreClient,
  type EngentyPluginListItem,
  type EngentySpace,
  type EngentyWorkspaceContext,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import type { RunSpaceResolution } from "./run-space.js";
import {
  formatSpaceRuntimeBlock,
  formatTenantInstalledModuleLine,
  type SpaceAgentIdentity,
} from "./runtime-space-block.js";
import { type AiSessionScope, scopeAccessToken } from "./types.js";

export async function buildRuntimeContextInstructions(input: {
  scope: AiSessionScope;
  /**
   * Authoritative Space state for this run. Consume the already-resolved
   * surface here; do not refetch it or present tenant-wide plugins as mounted.
   */
  spaceResolution?: RunSpaceResolution;
  /**
   * Legacy identity-only fallback for callers that have not yet passed
   * `spaceResolution`. A uuid here is not a resolved surface.
   */
  spaceId?: string | null;
  /** Engentys this space mounts — used only on the legacy identity fallback. */
  spaceAgentIds?: readonly string[];
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

  const accessToken = scopeAccessToken(input.scope)?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(accessToken && coreBaseUrl)) {
    lines.push(
      ...spaceLines(input),
      "- workspace_context: not loaded before this run; use engenty_tools_context if current tenant or user workspace details are needed."
    );
    return lines.join("\n");
  }

  try {
    const client = new EngentyCoreClient({ coreBaseUrl, accessToken });
    const workspace = await client.getWorkspaceContext();
    const [plugins, spaces, agentIdentities] = await Promise.all([
      client.listPlugins(workspace.currentTenant?.id),
      client.listSpaces().catch(() => [] as EngentySpace[]),
      fetchSpaceAgentIdentities({
        accessToken,
        coreBaseUrl,
        spaceResolution: input.spaceResolution,
      }),
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
    const tenantModuleIds = plugins
      .filter(isActiveModulePlugin)
      .map((plugin) => plugin.id)
      .sort((a, b) => a.localeCompare(b));
    lines.push(
      ...spaceLines(input, { agentIdentities, spaces, tenantModuleIds })
    );
  } catch {
    lines.push(
      ...spaceLines(input),
      "- workspace_context: unavailable before this run; use engenty_tools_context if needed."
    );
  }

  return lines.join("\n");
}

/**
 * Registry identities (id, name, description) for a resolved Space's mounted
 * Engentys — the roster the runtime block renders so the model can map a
 * display name the user says to an id it may address. Same endpoint the
 * `registry_agents_list` tool calls; any failure degrades to the id-only line.
 */
async function fetchSpaceAgentIdentities(input: {
  accessToken: string;
  coreBaseUrl: string;
  spaceResolution?: RunSpaceResolution;
}): Promise<SpaceAgentIdentity[] | undefined> {
  const resolution = input.spaceResolution;
  if (resolution?.kind !== "resolved" || resolution.space.agentIds.size === 0) {
    return;
  }
  try {
    const response = await fetch(
      `${input.coreBaseUrl.replace(/\/$/, "")}/ai/registry/agents`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${input.accessToken}`,
        },
      }
    );
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      agents?: SpaceAgentIdentity[];
    };
    return (data.agents ?? []).filter((agent) =>
      resolution.space.agentIds.has(agent.id)
    );
  } catch {
    return;
  }
}

function spaceLines(
  input: {
    spaceResolution?: RunSpaceResolution;
    spaceId?: string | null;
    spaceAgentIds?: readonly string[];
  },
  extras?: {
    agentIdentities?: readonly SpaceAgentIdentity[];
    spaces?: readonly EngentySpace[];
    tenantModuleIds?: readonly string[];
  }
): string[] {
  if (input.spaceResolution) {
    const spaceId =
      input.spaceResolution.kind === "resolved"
        ? input.spaceResolution.space.spaceId
        : undefined;
    return formatSpaceRuntimeBlock({
      ...(extras?.agentIdentities
        ? { agentIdentities: extras.agentIdentities }
        : {}),
      resolution: input.spaceResolution,
      spaceIdentity: spaceId
        ? (extras?.spaces?.find((entry) => entry.id === spaceId) ?? null)
        : null,
      tenantModuleIds: extras?.tenantModuleIds,
    });
  }

  if (input.spaceId) {
    const identity =
      extras?.spaces?.find((entry) => entry.id === input.spaceId) ?? null;
    const lines: string[] = [];
    if (identity) {
      const personal = identity.ownerUserId
        ? " — this is the user's PERSONAL space"
        : "";
      lines.push(
        `- current_space: ${identity.name} (${identity.key}, ${input.spaceId})${personal}`
      );
    } else {
      lines.push(
        `- current_space: ${input.spaceId} (name not loaded; Space surface was not supplied with this run)`
      );
    }
    if (input.spaceAgentIds && input.spaceAgentIds.length > 0) {
      lines.push(
        `- space_mounted_agents: ${[...input.spaceAgentIds].sort().join(", ")}`
      );
    }
    lines.push(
      "- space_mounted_modules: not supplied with this run's Space resolution; do not treat tenant_installed_modules as mounted here."
    );
    if (extras?.tenantModuleIds) {
      lines.push(
        formatTenantInstalledModuleLine(extras.tenantModuleIds, "space")
      );
    }
    return lines;
  }

  return formatSpaceRuntimeBlock({
    resolution: { kind: "global" },
    tenantModuleIds: extras?.tenantModuleIds,
  });
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
