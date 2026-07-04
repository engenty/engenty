import type { ConnectionsRepo } from "@engenty/connections-sdk";
import {
  ACTION_GROUP_DEFAULT_POLICY,
  connectionAccountLabel,
  connectorOperationId,
  getConnectorDefinition,
  grantedOperationIds,
  listConnectorDefinitions,
} from "@engenty/connections-sdk";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";

const connectionIdSchema = z.object({ connection_id: z.string().uuid() });

const groupSchema = z.enum(["read", "write", "destructive"]);
const policySchema = z.enum(["allow", "ask", "deny"]);

export interface ConnectionsOperationHooks {
  onApprovalDecided: (params: {
    approved: boolean;
    requestId: string;
    tenantId: string;
  }) => Promise<void>;
}

export function registerConnectionsOperations(
  api: PluginServerApi,
  repo: ConnectionsRepo,
  hooks: ConnectionsOperationHooks
): void {
  // ── Catalog: connectors + this principal's connection state ──────────────
  api.registerOperation({
    operationId: "connections_catalog",
    moduleId: "connections",
    summary: "List available connectors and the caller's connection status",
    description:
      "Connector catalog with per-action permission matrix and connection state for the calling user.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({}).optional(),
    handler: async (_input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { principalId, tenantId } = ctx.auth;
      const connectors = listConnectorDefinitions();
      const connections = await repo.listConnections({ tenantId });
      const visible = connections.filter(
        (c) => c.sharing === "org" || c.owner_user_id === principalId
      );
      const overrides = await repo.listPolicyOverrides(
        visible.map((c) => c.id)
      );
      return {
        connectors: connectors.map((connector) => ({
          actions: connector.actions.map((action) => ({
            default_policy: ACTION_GROUP_DEFAULT_POLICY[action.group],
            description: action.description,
            group: action.group,
            id: action.id,
            operation_id: connectorOperationId(connector, action.id),
            summary: action.summary,
          })),
          connections: visible
            .filter((c) => c.connector_id === connector.id)
            .map((connection) => ({
              ...connection,
              policies: overrides.filter(
                (o) => o.connection_id === connection.id
              ),
            })),
          description: connector.description,
          icon: connector.icon ?? null,
          id: connector.id,
          module_id: connector.moduleId,
          name: connector.name,
          tool_prefix: connector.toolPrefix,
        })),
      };
    },
  });

  // ── Account discovery for agents ──────────────────────────────────────────
  // Static tool descriptions cannot enumerate per-tenant accounts (the
  // operation catalog is process-global); this cheap read plus the
  // connection_ambiguous error path carry that job.
  api.registerOperation({
    operationId: "connections_list_accounts",
    moduleId: "connections",
    summary:
      "List the connected accounts usable for a connector (for the `account` param of its actions)",
    description:
      "Accounts the caller can address on a connector's actions via the optional `account` input param, with their sharing mode. Use when an action fails with connection_ambiguous.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({
      connector_id: z.string().describe('Connector id (e.g. "google-gmail").'),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as { connector_id: string };
      const candidates = await repo.listCandidateConnections({
        connectorId: parsed.connector_id,
        principalId: ctx.auth.principalId,
        tenantId: ctx.auth.tenantId,
      });
      return { accounts: candidates.map(connectionAccountLabel) };
    },
  });

  // ── Connection settings ───────────────────────────────────────────────────
  api.registerOperation({
    operationId: "connections_update_settings",
    moduleId: "connections",
    summary: "Update sharing, autonomous mode, or display name of a connection",
    riskLevel: "medium",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema.extend({
      autonomous_mode: z.enum(["off", "read_only", "full"]).optional(),
      display_name: z.string().max(200).nullable().optional(),
      non_owner_max_group: groupSchema.nullable().optional(),
      sharing: z.enum(["personal", "org"]).optional(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as z.infer<typeof connectionIdSchema> & {
        autonomous_mode?: "off" | "read_only" | "full";
        display_name?: string | null;
        non_owner_max_group?: "read" | "write" | "destructive" | null;
        sharing?: "personal" | "org";
      };
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      await repo.updateConnectionSettings({
        autonomousMode: parsed.autonomous_mode,
        connectionId: parsed.connection_id,
        displayName: parsed.display_name,
        nonOwnerMaxGroup: parsed.non_owner_max_group,
        sharing: parsed.sharing,
        tenantId: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: { connection_id: parsed.connection_id },
        type: "connection.settings_updated",
      });
      return { ok: true };
    },
  });

  api.registerOperation({
    operationId: "connections_set_policy",
    moduleId: "connections",
    summary: "Set or clear an allow/ask/deny policy for an action or group",
    riskLevel: "medium",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema.extend({
      policy: policySchema.nullable(),
      selector: z.string().min(1).max(120),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as {
        connection_id: string;
        policy: "allow" | "ask" | "deny" | null;
        selector: string;
      };
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      await repo.setPolicyOverride({
        connectionId: parsed.connection_id,
        policy: parsed.policy,
        selector: parsed.selector,
      });
      ctx.recordAuditEvent?.({
        detail: {
          connection_id: parsed.connection_id,
          policy: parsed.policy,
          selector: parsed.selector,
        },
        type: "connection.policy_updated",
      });
      return { ok: true };
    },
  });

  api.registerOperation({
    operationId: "connections_disconnect",
    moduleId: "connections",
    summary: "Disconnect and delete a connection (tokens are destroyed)",
    riskLevel: "high",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema,
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as { connection_id: string };
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      await repo.deleteConnection({
        connectionId: parsed.connection_id,
        tenantId: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: { connection_id: parsed.connection_id },
        type: "connection.disconnected",
      });
      return { ok: true };
    },
  });

  // ── Approvals ─────────────────────────────────────────────────────────────
  api.registerOperation({
    operationId: "connections_approvals_list",
    moduleId: "connections",
    summary: "List pending connection approval requests for this tenant",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({
      status: z.enum(["pending", "approved", "denied", "expired"]).optional(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as {
        status?: "pending" | "approved" | "denied" | "expired";
      };
      return {
        requests: await repo.listApprovalRequests({
          status: parsed.status ?? "pending",
          tenantId: ctx.auth.tenantId,
        }),
      };
    },
  });

  api.registerOperation({
    operationId: "connections_approvals_decide",
    moduleId: "connections",
    summary: "Approve or deny a pending connection approval request",
    riskLevel: "high",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: z.object({
      approved: z.boolean(),
      /** Also persist an allow policy so retries pass without re-asking. */
      grant_always: z.boolean().optional(),
      request_id: z.string().uuid(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as {
        approved: boolean;
        grant_always?: boolean;
        request_id: string;
      };
      const decided = await repo.decideApprovalRequest({
        decidedBy: ctx.auth.principalId,
        id: parsed.request_id,
        status: parsed.approved ? "approved" : "denied",
        tenantId: ctx.auth.tenantId,
      });
      if (!decided) {
        throw new Error("approval_request_not_pending");
      }
      await assertOwnerOrThrow(repo, ctx.auth, decided.connection_id);
      if (parsed.approved && parsed.grant_always) {
        await repo.setPolicyOverride({
          connectionId: decided.connection_id,
          policy: "allow",
          selector: decided.action_id,
        });
      }
      await hooks.onApprovalDecided({
        approved: parsed.approved,
        requestId: decided.id,
        tenantId: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: {
          approved: parsed.approved,
          connection_id: decided.connection_id,
          request_id: decided.id,
        },
        type: "connection.approval_decided",
      });
      return { ok: true, request: decided };
    },
  });

  // ── Run-start grants for the AI pre-gate ──────────────────────────────────
  api.registerOperation({
    operationId: "connections_granted_operations",
    moduleId: "connections",
    summary:
      "Operation ids the caller has durably allowed on their connections (merged into chat approval grants)",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({}).optional(),
    handler: async (_input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { principalId, tenantId } = ctx.auth;
      const connections = await repo.listConnections({ tenantId });
      const usable = connections.filter(
        (c) =>
          c.status === "active" &&
          (c.sharing === "org" || c.owner_user_id === principalId)
      );
      const overrides = await repo.listPolicyOverrides(usable.map((c) => c.id));
      const granted = new Set<string>();
      for (const connection of usable) {
        const connector = getConnectorDefinition(connection.connector_id);
        if (!connector) {
          continue;
        }
        for (const id of grantedOperationIds({
          actions: connector.actions,
          connection,
          isAutonomous: false,
          overrides: overrides.filter((o) => o.connection_id === connection.id),
          principal: { principalId, principalType: "user" },
          toolPrefix: connector.toolPrefix,
        })) {
          granted.add(id);
        }
      }
      return { operation_ids: [...granted] };
    },
  });
}

async function assertOwnerOrThrow(
  repo: ConnectionsRepo,
  auth: { principalId: string; tenantId: string },
  connectionId: string
): Promise<void> {
  const connection = await repo.getConnection({
    connectionId,
    tenantId: auth.tenantId,
  });
  if (!connection) {
    throw new Error("connection_not_found");
  }
  // Owners manage their connections. Org connections without an owner match
  // (e.g. the owner left) stay manageable via tenant admin capability, which
  // the operation-level requiredCapabilities already gate.
  if (
    connection.sharing === "personal" &&
    connection.owner_user_id !== auth.principalId
  ) {
    throw new Error("connection_not_owner");
  }
}
