import {
  createConnectionsModuleClient,
  getConnectorDefinition,
} from "@engenty/connections-sdk";
import type {
  EngentyPluginFactory,
  EntityEventPayload,
  PluginAuthContext,
} from "@engenty/plugin-sdk";
import { createPluginServerGatewayCaller } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inboxAiRegistration } from "../ai/registrar.js";
import { registerInboxGatewayMethods } from "./api/gateway-methods.js";
import type { EmitInboxEvent } from "./dal/contracts.js";
import { createInboxRetrievalSource } from "./dal/inbox-retrieval-source.js";
import { createInboxRepoSupabase } from "./dal/supabase.js";

type InboxEntityPayload = EntityEventPayload<"message_id">;

const registerInboxPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "inbox.viewer",
      title: "Inbox viewer",
      capabilities: ["module.inbox.read"],
    },
    {
      id: "inbox.editor",
      title: "Inbox editor",
      capabilities: ["module.inbox.read", "module.inbox.write"],
    },
  ]);
  const { events, server } = engenty;
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). The service client
  // remains ONLY for the connections client's OAuth client-credential resolver:
  // it reads PLATFORM-level settings rows (tenant override → platform → env)
  // that carry tenant_id NULL, which a tenant-locked handle cannot see by design.
  const serviceDb = (server.getServiceDb?.() ?? null) as SupabaseClient | null;
  const getTenantDb = server.getTenantDb;
  if (!(serviceDb && getTenantDb)) {
    throw new Error(
      "Inbox module requires Supabase (supabaseUrl and supabaseServiceRoleKey) and the tenant-locked DB seam (getTenantDb)"
    );
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  // `synced` (new message stored) doubles as the search re-index signal and
  // the Model-2 triage consumers' subscription point (event triggers).
  const emitInboxEvent: EmitInboxEvent = async (verb, payload) => {
    await events.modules.emit<InboxEntityPayload>(
      `inbox.message.${verb}` as const,
      payload satisfies InboxEntityPayload,
      { tenantId: payload.tenant_id }
    );
  };

  // `inbox.message` is a managed retrieval source (retrieval-service
  // Phase 3): the central service owns embeddings/fusion/backfill; the
  // module supplies the mail document builder, owner visibility, and
  // connection/status filters. The host manufactures the provider and
  // synthesizes the unchanged `inbox_message_search` tool. Events: `synced`
  // and `updated` re-ingest (status is filterable metadata), `deleted`
  // clears the row.
  if (!server.registerRetrievalSource) {
    throw new Error(
      "Inbox module requires a host with the central retrieval service"
    );
  }
  server.registerRetrievalSource(createInboxRetrievalSource({ getDb }));

  // Cross-module sanctioned client — tenant rows (connections, policies, token
  // refresh) resolve per call on the caller's tenant-locked handle; serviceDb
  // feeds ONLY the OAuth client-credential resolver (see the seam comment above).
  const connectionsClient = createConnectionsModuleClient(
    { getDb, serviceDb },
    { moduleId: "inbox" }
  );

  const repoForAuth = (auth: PluginAuthContext | undefined) => {
    if (!auth) {
      throw new Error("Inbox operations require an authenticated context");
    }
    const userId =
      (auth as PluginAuthContext & { userId?: string }).userId ??
      auth.principalId ??
      null;
    return createInboxRepoSupabase(
      getDb(auth),
      auth.tenantId,
      auth.scopeId ?? "default",
      userId,
      { emitInboxEvent }
    );
  };

  // "Service" = userId null (sync sees personal connections too), NOT the
  // service-role client — the handle is still locked to the sync's tenant.
  const serviceRepoFor = (tenantId: string) =>
    createInboxRepoSupabase(getDb({ tenantId }), tenantId, "default", null, {
      emitInboxEvent,
    });

  registerInboxGatewayMethods(server, {
    connectionsClient,
    getConnector: getConnectorDefinition,
    repoForAuth,
    serviceRepoFor,
  });

  const { invokeOperation } = createPluginServerGatewayCaller(server);
  server.registerAiRegistration?.(
    inboxAiRegistration({ invokeInboxOperation: invokeOperation })
  );
};

export default registerInboxPlugin;
