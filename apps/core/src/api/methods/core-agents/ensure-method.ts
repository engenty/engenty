// `core_agents_ensure` — find-or-create an agent principal, with the module's
// read role attached the first time it appears.
//
// Minting lives HERE rather than in the AI plane on purpose: an agent principal
// is an authz subject, and the grant that comes with it is an authz write. The
// AI plane knows agent KEYS ("contacts.manager"); core owns what a key means as
// a subject. See PLAN-workflow-designer.md Phase 7 #8.
//
// Safe to call on every run — which is what the AI plane does, behind a cache.
// Module-viewer grants land ONLY on the call that created the principal, so a
// revoked default stays revoked.
import type { PluginGatewayMethod } from "@engenty/plugin-sdk";
import {
  assignRole,
  ensureAgentPrincipal,
  listAssignedRoleIds,
} from "../../../dal/role-assignments.js";
import { createDatabaseAdapter } from "../../../infra/index.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import {
  defaultAgentRoleId,
  shouldAssignDefaultAgentRole,
} from "../../../security/default-agent-role.js";

export function buildCoreAgentsEnsureMethod(
  registry: PluginRegistry,
  config: Record<string, unknown>
): PluginGatewayMethod {
  const serviceClient = () => {
    const client = createDatabaseAdapter(config);
    if (!client) {
      throw new Error("core_agents_ensure requires Supabase configuration.");
    }
    return client;
  };
  return {
    name: "core_agents_ensure",
    summary: "Find or create an agent principal in the current tenant",
    operation: {
      moduleId: "core",
      operationId: "core_agents_ensure",
      // Provisioning, not tenant administration: only a platform/service
      // principal (or superadmin) holds this.
      requiredCapabilities: ["core.agents.manage"],
      riskLevel: "medium",
      requiresApproval: false,
    },
    handler: async (input, ctx) => {
      const { name } = input as { name?: string };
      const agentTypeKey = name?.trim();
      if (!agentTypeKey) {
        throw new Error("agent name is required");
      }
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("Tenant context required");
      }

      const db = serviceClient();
      const { agent, created } = await ensureAgentPrincipal(
        db,
        tenantId,
        agentTypeKey
      );

      const known = new Set(
        (registry.roleProfiles?.listWithSource() ?? []).map(
          ({ profile }) => profile.id
        )
      );
      const roleId = defaultAgentRoleId(agentTypeKey, (id) => known.has(id));
      if (!roleId) {
        return { granted_role_ids: [], id: agent.id, name: agent.name };
      }

      const assignedRoleIds = await listAssignedRoleIds(db, tenantId, {
        id: agent.id,
        kind: "agent",
      });
      if (
        !shouldAssignDefaultAgentRole({
          agentTypeKey,
          assignedRoleIds,
          created,
          roleId,
        })
      ) {
        return { granted_role_ids: [], id: agent.id, name: agent.name };
      }

      await assignRole(db, {
        roleId,
        subject: { id: agent.id, kind: "agent" },
        tenantId,
      });
      return { granted_role_ids: [roleId], id: agent.id, name: agent.name };
    },
  };
}
