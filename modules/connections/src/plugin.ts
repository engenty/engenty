import {
  createConnectionsRepo,
  listMountedConnectionAccess,
  mountConnectionInSpace,
  resolveVerifiedSpaceOwnerForRun,
} from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerConnectionsCredentialsRoutes } from "./api/credentials-routes.js";
import { registerConnectionsOAuthRoutes } from "./api/oauth-routes.js";
import { registerConnectionsOperations } from "./api/operations.js";
import { createConnectionsSettingsResolver } from "./lib/settings-resolver.js";
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
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). The service client
  // remains ONLY for the two context-less lanes that resolve tenancy themselves:
  // the anonymous OAuth callback's state-row lookup (serviceRepo, commented in
  // oauth-routes.ts) and the client-credential resolver (platform-level settings
  // rows carry tenant_id NULL — unreachable from the tenant lane by design).
  const serviceDb = (server.getServiceDb?.() ?? null) as SupabaseClient | null;
  const getTenantDb = server.getTenantDb;
  if (!(serviceDb && getTenantDb)) {
    throw new Error(
      "Connections module requires Supabase (supabaseUrl and supabaseServiceRoleKey) and tenant-locked handles (server.getTenantDb)"
    );
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;
  const getRepo = (auth: { tenantId: string }) =>
    createConnectionsRepo(getDb(auth));
  const serviceRepo = createConnectionsRepo(serviceDb);
  // Tenant/platform-aware OAuth client-credential overrides (Setup UI).
  const settings = createConnectionsSettingsResolver(serviceDb);

  // NOTE: nothing subscribes to `connections.connected` today. This comment
  // used to claim chat connect cards, task re-dispatch, and notification
  // fan-out did — none of them do: the in-chat connect card resumes by
  // injecting a synthetic user message, and task re-dispatch rides
  // `connections.approval.decided` (which DOES have a subscriber, in the tasks
  // module). Kept as a published event because a tenant trigger can bind to it
  // by name, but treat it as unconsumed until a subscriber exists (audit
  // CON-03). The connect routes themselves stay transport-only.
  const onConnected = async (event: {
    connectorId: string;
    sharing: "personal" | "org";
    tenantId: string;
  }) => {
    await events.modules.emit(
      "connections.connected",
      { connector_id: event.connectorId, sharing: event.sharing },
      { tenantId: event.tenantId }
    );
  };
  registerConnectionsOAuthRoutes(
    server,
    { getDb: (tenantId) => getDb({ tenantId }), getRepo, serviceRepo },
    settings,
    { onConnected }
  );
  registerConnectionsCredentialsRoutes(server, getRepo, { onConnected });

  registerConnectionsOperations(server, getRepo, {
    // `core.agents.name` holds the agent key, which is the only identifier an
    // agent can see. Read on the service handle and filtered by tenant: the
    // table is platform data with no scope_id, so foreignSelect does not apply.
    resolveAgentPrincipalId: async ({ agentKey, tenantId }) => {
      const { data } = await serviceDb
        .schema("core")
        .from("agents")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("name", agentKey)
        .limit(1)
        .maybeSingle();
      return (data as { id?: string } | null)?.id ?? null;
    },
    mountConnectionInSpace: async ({ connectionId, spaceId, tenantId }) => {
      await mountConnectionInSpace(getDb({ tenantId }), {
        connectionId,
        spaceId,
        tenantId,
      });
    },
    settings,
    // task_id/operation_id ride along so the tasks module can resume the
    // blocked run the approval was really about (subscriber pattern — no
    // import between the modules).
    onApprovalDecided: async ({
      approved,
      operationId,
      requestId,
      taskId,
      tenantId,
    }) => {
      await events.modules.emit(
        "connections.approval.decided",
        {
          approved,
          operation_id: operationId,
          request_id: requestId,
          task_id: taskId,
        },
        { tenantId }
      );
    },
  });

  // Approval REQUESTS are core's now: the profile policy returns
  // `require_approval` with connection context, and core's approval gate files
  // the deduped request in core.approval_requests + emits `approval.requested`.
  // The onAutonomousAsk hook that wrote module_connections.approval_requests
  // here is gone with the second ledger it fed.
  // The space narrows WHICH ACCOUNT (CN.3) and says how far its engentys may
  // go with it (PLAN-connections-ux.md B1); the repo decides everything else.
  // Same tenant-locked handle, so the mount read is confined exactly as the
  // connection read is.
  server.registerProfilePolicy(
    createConnectionsProfilePolicy(
      getRepo,
      ({ spaceId, tenantId }) =>
        listMountedConnectionAccess(getDb({ tenantId }), tenantId, spaceId),
      // §2.1 — personal-space owner reach, verified against the routine's
      // stored space binding on the same tenant-locked handle.
      ({ principalType, spaceId, tenantId, triggerId }) =>
        resolveVerifiedSpaceOwnerForRun(getDb({ tenantId }), {
          principalType,
          spaceId,
          tenantId,
          triggerId,
        })
    )
  );
};

export default registerConnectionsPlugin;
