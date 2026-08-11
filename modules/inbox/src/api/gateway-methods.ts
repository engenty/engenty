import type {
  ConnectionsModuleClient,
  ConnectorDefinition,
} from "@engenty/connections-sdk";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxRepo } from "../dal/contracts.js";
import {
  inboxAccountsListResultSchema,
  inboxAttachmentGetInputSchema,
  inboxAttachmentGetResultSchema,
  inboxClassifyPendingInputSchema,
  inboxClassifyPendingResultSchema,
  inboxSetStatusInputSchema,
  inboxSetStatusResultSchema,
  inboxSyncRunInputSchema,
  inboxSyncRunResultSchema,
  inboxSyncSettingsInputSchema,
  inboxSyncStateSchema,
  inboxThreadChatInputSchema,
  inboxThreadChatResultSchema,
  inboxThreadDetailSchema,
  inboxThreadDigestGetInputSchema,
  inboxThreadDigestResultSchema,
  inboxThreadGetInputSchema,
  inboxThreadsListInputSchema,
  inboxThreadsListResultSchema,
} from "../schema/zod.js";
import { loadInboxCategories } from "../services/inbox-categories.js";
import { classifyInboxMessages } from "../services/message-classify.js";
import { resolveInboxAiModel } from "../services/resolve-inbox-model.js";
import { answerThreadQuestion } from "../services/thread-chat.js";
import { ensureThreadDigest } from "../services/thread-digest.js";
import type { InboxSyncDeps } from "../sync/sync-service.js";
import { runInboxSync } from "../sync/sync-service.js";
import { fetchInboxAttachment } from "./fetch-attachment.js";

/**
 * The acting user for owner visibility. Core's runtime auth carries `userId`
 * for user tokens (same field the synthesized search op reads); `principalId`
 * is the fallback since it equals the auth user id on that path. Service
 * principals simply don't match any `owner_user_id`, so they see org-scoped
 * rows only — the service-wide view is reserved for the sync path, which
 * builds its repo with an explicit `null`.
 */
function actingUserId(auth: PluginAuthContext | undefined): string | null {
  const withUser = auth as
    | (PluginAuthContext & { userId?: string })
    | undefined;
  return withUser?.userId ?? withUser?.principalId ?? null;
}

export interface RegisterInboxGatewayMethodsOptions {
  connectionsClient: ConnectionsModuleClient;
  getConnector: (connectorId: string) => ConnectorDefinition | undefined;
  /** Tenant-locked DB handle factory (for ai.config reads). */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  /** Repo bound to the caller (owner visibility applied). */
  repoForAuth: (auth: PluginAuthContext | undefined) => InboxRepo;
  /** Service-role client — platform `ai.model_binding` has no tenant_id. */
  serviceDb?: SupabaseClient | null;
  /** Service repo for the sync path (sees personal connections too). */
  serviceRepoFor: (tenantId: string) => InboxRepo;
  serviceTenantId?: never;
}

export function registerInboxGatewayMethods(
  api: PluginServerApi,
  options: RegisterInboxGatewayMethodsOptions
) {
  const {
    connectionsClient,
    getConnector,
    getDb,
    repoForAuth,
    serviceDb,
    serviceRepoFor,
  } = options;

  async function inboxModel(auth: PluginAuthContext | undefined) {
    if (!auth) {
      throw new Error("Inbox AI operations require an authenticated context");
    }
    return resolveInboxAiModel({ auth, getDb, serviceDb });
  }

  async function inboxCategoryItems(auth: PluginAuthContext | undefined) {
    if (!auth) {
      throw new Error("Inbox AI operations require an authenticated context");
    }
    const config = await loadInboxCategories({ auth, getDb });
    return config.items;
  }

  api.registerOperation({
    operationId: "inbox_threads_list",
    moduleId: "inbox",
    summary: "List inbox threads (account filter, status lanes, paging)",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxThreadsListInputSchema,
    outputSchema: inboxThreadsListResultSchema,
    handler: async (input, ctx) => {
      const repo = repoForAuth(ctx.auth);
      const parsed = inboxThreadsListInputSchema.parse(input ?? {});
      return repo.threads.listPaginated(parsed);
    },
  });

  api.registerOperation({
    operationId: "inbox_thread_get",
    moduleId: "inbox",
    summary: "Get an inbox thread with all of its messages",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxThreadGetInputSchema,
    outputSchema: inboxThreadDetailSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = repoForAuth(ctx.auth);
      const parsed = inboxThreadGetInputSchema.parse(input);
      const thread = await repo.threads.getById(parsed.id);
      if (!thread) {
        return null;
      }
      const messages = await repo.messages.listByThread(thread.id);
      return { messages, thread };
    },
  });

  api.registerOperation({
    operationId: "inbox_thread_digest_get",
    moduleId: "inbox",
    summary:
      "Get the optimized (AI-stripped) view of a thread: per-message digests, and — with include_summary — the thread status summary, participants and next actions",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    inputSchema: inboxThreadDigestGetInputSchema,
    outputSchema: inboxThreadDigestResultSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = repoForAuth(ctx.auth);
      const parsed = inboxThreadDigestGetInputSchema.parse(input);
      const thread = await repo.threads.getById(parsed.thread_id);
      if (!thread) {
        return null;
      }
      const messages = await repo.messages.listByThread(thread.id);
      const [modelId, categoryItems] = await Promise.all([
        inboxModel(ctx.auth),
        inboxCategoryItems(ctx.auth),
      ]);
      return ensureThreadDigest({
        categoryItems,
        includeSummary: parsed.include_summary ?? false,
        messages,
        modelId,
        refresh: parsed.refresh ?? false,
        repo,
        thread,
      });
    },
  });

  api.registerOperation({
    operationId: "inbox_thread_chat",
    moduleId: "inbox",
    summary: "Ask a question about one thread, grounded in its digests",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    inputSchema: inboxThreadChatInputSchema,
    outputSchema: inboxThreadChatResultSchema,
    handler: async (input, ctx) => {
      const repo = repoForAuth(ctx.auth);
      const parsed = inboxThreadChatInputSchema.parse(input);
      const thread = await repo.threads.getById(parsed.thread_id);
      if (!thread) {
        throw new Error("inbox: unknown thread");
      }
      const [messages, digests, modelId] = await Promise.all([
        repo.messages.listByThread(thread.id),
        repo.digests.listMessageDigests(thread.id),
        inboxModel(ctx.auth),
      ]);
      const answer = await answerThreadQuestion({
        digests,
        history: parsed.history ?? [],
        messages,
        modelId,
        question: parsed.question,
        thread,
      });
      return { answer_md: answer };
    },
  });

  api.registerOperation({
    operationId: "inbox_classify_pending",
    moduleId: "inbox",
    summary:
      "Classify messages that have no category yet (feeds the inbox category lanes)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxClassifyPendingInputSchema,
    outputSchema: inboxClassifyPendingResultSchema,
    handler: async (input, ctx) => {
      const repo = repoForAuth(ctx.auth);
      const parsed = inboxClassifyPendingInputSchema.parse(input ?? {});
      const pending = await repo.messages.listUnclassified(parsed.limit ?? 60);
      if (pending.length === 0) {
        return { classified: 0, remaining: 0 };
      }
      const [modelId, categoryItems] = await Promise.all([
        inboxModel(ctx.auth),
        inboxCategoryItems(ctx.auth),
      ]);
      const categories = await classifyInboxMessages(
        pending,
        modelId,
        categoryItems
      );
      const classified = await repo.messages.setCategories(categories);
      return {
        classified,
        remaining: await repo.messages.countUnclassified(),
      };
    },
  });

  api.registerOperation({
    operationId: "inbox_set_status",
    moduleId: "inbox",
    summary: "Set the mailbox status of inbox messages (new | read | archived)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxSetStatusInputSchema,
    outputSchema: inboxSetStatusResultSchema,
    handler: async (input, ctx) => {
      const repo = repoForAuth(ctx.auth);
      const parsed = inboxSetStatusInputSchema.parse(input);
      const updated = await repo.messages.setStatus(
        parsed.ids,
        parsed.status,
        ctx.auth?.principalId ?? null
      );
      return { updated };
    },
  });

  api.registerOperation({
    operationId: "inbox_accounts_list",
    moduleId: "inbox",
    summary: "List connected mail accounts with their inbox sync state",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}).optional(),
    outputSchema: inboxAccountsListResultSchema,
    handler: async (_input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("inbox_accounts_list requires authentication");
      }
      const userId = actingUserId(auth);
      const repo = repoForAuth(auth);
      const [connections, syncStates] = await Promise.all([
        connectionsClient.listConnections({ tenantId: auth.tenantId }),
        repo.syncState.list(),
      ]);
      const stateByConnection = new Map(
        syncStates.map((state) => [state.connection_id, state])
      );
      const accounts = connections
        // Personal accounts of other users are not this caller's business.
        .filter(
          (connection) =>
            connection.sharing === "org" || connection.owner_user_id === userId
        )
        // Streamless connectors can never sync mail — keep them off the page.
        .filter((connection) =>
          Boolean(getConnector(connection.connector_id)?.stream)
        )
        .map((connection) => ({
          autonomous_mode: connection.autonomous_mode,
          connection_id: connection.id,
          connector_id: connection.connector_id,
          display_name: connection.display_name,
          external_account: connection.external_account,
          owner_user_id: connection.owner_user_id,
          sharing: connection.sharing,
          stream_supported: true,
          sync_state: stateByConnection.get(connection.id) ?? null,
        }));
      return { accounts };
    },
  });

  api.registerOperation({
    operationId: "inbox_sync_settings_update",
    moduleId: "inbox",
    summary: "Update per-account inbox sync settings (toggle, backfill window)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxSyncSettingsInputSchema,
    outputSchema: inboxSyncStateSchema,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("inbox_sync_settings_update requires authentication");
      }
      const parsed = inboxSyncSettingsInputSchema.parse(input);
      const connections = await connectionsClient.listConnections({
        tenantId: auth.tenantId,
      });
      const connection = connections.find(
        (candidate) => candidate.id === parsed.connection_id
      );
      if (!connection) {
        throw new Error("inbox: unknown connection");
      }
      const userId = actingUserId(auth);
      if (
        connection.sharing === "personal" &&
        connection.owner_user_id !== userId
      ) {
        throw new Error(
          "inbox: only the owner can change a personal account's sync settings"
        );
      }
      const repo = repoForAuth(auth);
      return repo.syncState.upsertSettings(parsed.connection_id, {
        owner_user_id:
          connection.sharing === "personal" ? connection.owner_user_id : null,
        ...(parsed.backfill_days === undefined
          ? {}
          : { backfill_days: parsed.backfill_days }),
        ...(parsed.sync_enabled === undefined
          ? {}
          : { sync_enabled: parsed.sync_enabled }),
      });
    },
  });

  api.registerOperation({
    operationId: "inbox_attachment_get",
    moduleId: "inbox",
    summary: "Fetch attachment bytes for an inbox message preview",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxAttachmentGetInputSchema,
    outputSchema: inboxAttachmentGetResultSchema,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("inbox_attachment_get requires authentication");
      }
      const parsed = inboxAttachmentGetInputSchema.parse(input);
      return fetchInboxAttachment({
        attachmentId: parsed.attachment_id,
        auth,
        connectionsClient,
        getConnector,
        messageId: parsed.message_id,
        repo: repoForAuth(auth),
      });
    },
  });

  api.registerOperation({
    operationId: "inbox_sync_run",
    moduleId: "inbox",
    summary:
      "Run the inbox sync now (all stream-capable accounts, or one connection)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxSyncRunInputSchema,
    outputSchema: inboxSyncRunResultSchema,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("inbox_sync_run requires authentication");
      }
      const parsed = inboxSyncRunInputSchema.parse(input ?? {});
      const deps: InboxSyncDeps = {
        connectionsClient,
        hasMessageStream: (connectorId) =>
          Boolean(getConnector(connectorId)?.stream),
        repo: serviceRepoFor(auth.tenantId),
        tenantId: auth.tenantId,
      };
      return runInboxSync(
        deps,
        parsed.connection_id ? { connectionId: parsed.connection_id } : {}
      );
    },
  });
}
