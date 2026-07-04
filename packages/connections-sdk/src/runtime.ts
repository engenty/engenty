import type {
  EngentyPluginApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "./oauth2.js";
import { resolveConnectionActionPolicy } from "./policy.js";
import { createConnectionsRepo } from "./repo.js";
import { registerConnectorDefinition } from "./registry.js";
import type { ConnectorAction, ConnectorDefinition } from "./types.js";
import { ACTION_GROUP_CONTRACTS, connectorOperationId } from "./types.js";

export function defineConnector(def: ConnectorDefinition): ConnectorDefinition {
  return def;
}

function buildActionOperation(params: {
  action: ConnectorAction;
  connector: ConnectorDefinition;
  supabase: SupabaseClient;
}): PluginServerOperation {
  const { action, connector, supabase } = params;
  const contract = ACTION_GROUP_CONTRACTS[action.group];
  const operationId = connectorOperationId(connector, action.id);
  const repo = createConnectionsRepo(supabase);

  return {
    description: `${action.description} (external connection: ${connector.name})`,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("connection_auth_required");
      }
      const connection = await repo.resolveConnectionForPrincipal({
        connectorId: connector.id,
        principalId: auth.principalId,
        tenantId: auth.tenantId,
      });
      if (!connection) {
        throw new Error(
          `connection_not_connected: no active ${connector.name} connection for this account. Connect it under Settings → Connections.`
        );
      }
      // Defense in depth: the connections profile policy is the authoritative
      // gate (with full principal context); the runtime re-checks with the
      // narrower gateway auth so a route that skipped policy still cannot
      // execute a denied action.
      const overrides = await repo.listPolicyOverrides([connection.id]);
      const resolved = resolveConnectionActionPolicy({
        action,
        connection,
        isAutonomous: false,
        overrides,
        principal: { principalId: auth.principalId, principalType: "user" },
      });
      if (resolved.decision === "deny") {
        throw new Error(`connection_denied: ${resolved.reason}`);
      }
      const output = await repo.withFreshAccessToken(
        {
          connectionId: connection.id,
          refresh: async (refreshToken) => {
            const refreshed = await refreshAccessToken({
              config: connector.auth.oauth2,
              refreshToken,
            });
            return {
              accessToken: refreshed.accessToken,
              expiresAt: refreshed.expiresAt,
              refreshToken: refreshed.refreshToken,
            };
          },
        },
        (accessToken) =>
          Promise.resolve(
            action.handler(input, {
              accessToken,
              connection,
              fetchImpl: fetch,
              log: (msg, data) => ctx.logger.info(msg, data ?? {}),
            })
          )
      );
      ctx.recordAuditEvent?.({
        detail: { action: action.id, connection_id: connection.id },
        type: "connection.action_executed",
      });
      return output;
    },
    idempotent: contract.idempotent,
    inputSchema: action.inputSchema,
    moduleId: connector.moduleId,
    operationId,
    ...(action.outputSchema ? { outputSchema: action.outputSchema } : {}),
    requiredCapabilities: [
      `module.connections.${action.group === "read" ? "read" : "write"}`,
    ],
    requiresApproval: contract.requiresApproval,
    riskLevel: contract.riskLevel,
    summary: action.summary,
  };
}

/**
 * Register a connector inside a connector module's plugin factory: adds the
 * definition to the shared registry (OAuth routes + UI catalog) and registers
 * one module operation per action under the connector module's provenance.
 */
export function registerConnectorModule(
  engenty: EngentyPluginApi,
  def: ConnectorDefinition
): void {
  const supabaseRaw = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      `Connector module ${def.moduleId} requires a database adapter`
    );
  }
  const supabase = supabaseRaw as SupabaseClient;
  registerConnectorDefinition(def);
  for (const action of def.actions) {
    engenty.server.registerOperation(
      buildActionOperation({ action, connector: def, supabase })
    );
  }
}
