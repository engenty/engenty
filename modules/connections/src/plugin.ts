import { createConnectionsRepo } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerConnectionsCredentialsRoutes } from "./api/credentials-routes.js";
import { registerConnectionsOAuthRoutes } from "./api/oauth-routes.js";
import { registerConnectionsOperations } from "./api/operations.js";
import { createConnectionsProfilePolicy } from "./policy.js";

/**
 * Connections framework module. Connector modules (connections-google, …)
 * register their ConnectorDefinitions + per-action operations through
 * `@engenty/connections-sdk`; this module owns the shared machinery:
 * schema, OAuth flow, management operations, the authoritative policy gate,
 * and the approval-request lifecycle.
 */
const registerConnectionsPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "connections.viewer",
      title: "Connections viewer",
      capabilities: ["module.connections.read"],
    },
    {
      id: "connections.editor",
      title: "Connections editor",
      capabilities: ["module.connections.read", "module.connections.write"],
    },
  ]);
  const { events, server } = engenty;
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      "Connections module requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
    );
  }
  const repo = createConnectionsRepo(supabaseRaw as SupabaseClient);

  registerConnectionsOAuthRoutes(server, repo);
  registerConnectionsCredentialsRoutes(server, repo);

  registerConnectionsOperations(server, repo, {
    onApprovalDecided: async ({ approved, requestId, tenantId }) => {
      await events.modules.emit(
        "connections.approval.decided",
        { approved, request_id: requestId },
        { tenantId }
      );
    },
  });

  server.registerProfilePolicy(
    createConnectionsProfilePolicy(repo, {
      onAutonomousAsk: async (params) => {
        // Dedupe: one pending request per (connection, operation, principal).
        const pending = await repo.listApprovalRequests({
          status: "pending",
          tenantId: params.tenantId,
        });
        const exists = pending.some(
          (r) =>
            r.connection_id === params.connectionId &&
            r.operation_id === params.operationId &&
            r.requested_by === params.requestedBy
        );
        if (exists) {
          return;
        }
        const request = await repo.createApprovalRequest({
          actionId: params.actionId,
          connectionId: params.connectionId,
          operationId: params.operationId,
          requestedBy: params.requestedBy,
          tenantId: params.tenantId,
        });
        // Notification fan-out (inbox, triggers) subscribes to this event.
        await events.modules.emit(
          "connections.approval.requested",
          {
            action_id: params.actionId,
            connection_id: params.connectionId,
            operation_id: params.operationId,
            request_id: request.id,
          },
          { tenantId: params.tenantId }
        );
      },
    })
  );
};

export default registerConnectionsPlugin;
