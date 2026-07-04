import {
  createConnectionsModuleClient,
  getConnectorDefinition,
} from "@engenty/connections-sdk";
import type {
  EngentyPluginFactory,
  EntityEventPayload,
  PluginAuthContext,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerInboxGatewayMethods } from "./api/gateway-methods.js";
import type { EmitInboxEvent } from "./dal/contracts.js";
import { createInboxSearchIndexProvider } from "./dal/inbox-search-index-provider.js";
import { createInboxRepoSupabase } from "./dal/supabase.js";

type InboxEntityPayload = EntityEventPayload<"message_id">;

const registerInboxPlugin: EngentyPluginFactory = (engenty) => {
  const { events, server } = engenty;
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      "Inbox module requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
    );
  }
  const supabase = supabaseRaw as SupabaseClient;

  // `synced` (new message stored) doubles as the search re-index signal and
  // the Model-2 triage consumers' subscription point (event triggers).
  const emitInboxEvent: EmitInboxEvent = async (verb, payload) => {
    await events.modules.emit<InboxEntityPayload>(
      `inbox.message.${verb}` as const,
      payload satisfies InboxEntityPayload,
      { tenantId: payload.tenant_id }
    );
  };

  const searchProvider = createInboxSearchIndexProvider({ supabase });
  // Auto-tool `inbox_message_search`. The provider searches the base table
  // via FTS (no derived index), so no declarative re-index bindings are
  // needed — the GIN index updates with the row itself.
  server.registerSearchIndexProvider(searchProvider, {
    capabilities: searchProvider.capabilities,
    entityName: "message",
    moduleId: "inbox",
    operationOverrides: {
      idempotent: true,
      requiredCapabilities: ["module.inbox.read"],
      riskLevel: "low",
      summary:
        "Search synced inbox messages by sender, subject, or body text (local store — no provider quota)",
    },
  });

  const connectionsClient = createConnectionsModuleClient(supabase, {
    moduleId: "inbox",
  });

  const repoForAuth = (auth: PluginAuthContext | undefined) => {
    if (!auth) {
      throw new Error("Inbox operations require an authenticated context");
    }
    const userId =
      (auth as PluginAuthContext & { userId?: string }).userId ??
      auth.principalId ??
      null;
    return createInboxRepoSupabase(
      supabase,
      auth.tenantId,
      auth.scopeId ?? "default",
      userId,
      { emitInboxEvent }
    );
  };

  const serviceRepoFor = (tenantId: string) =>
    createInboxRepoSupabase(supabase, tenantId, "default", null, {
      emitInboxEvent,
    });

  registerInboxGatewayMethods(server, {
    connectionsClient,
    getConnector: getConnectorDefinition,
    repoForAuth,
    serviceRepoFor,
  });
};

export default registerInboxPlugin;
