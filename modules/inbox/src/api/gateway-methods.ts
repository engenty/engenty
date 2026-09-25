import { resolveModuleClassifier } from "@engenty/ai-core";
import type {
  ConnectionsModuleClient,
  ConnectorDefinition,
} from "@engenty/connections-sdk";
import { resolveSpaceRecordAccounts } from "@engenty/connections-sdk";
import {
  actorUserIdFromAuth,
  createRecordLinker,
  type PluginAuthContext,
  type PluginServerApi,
  type RecordLinkAuth,
  withRecordLink,
  withRecordLinks,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxRepo } from "../dal/contracts.js";
import {
  inboxAccountBindInputSchema,
  inboxAccountBindResultSchema,
  inboxAccountsListResultSchema,
  inboxAttachmentGetInputSchema,
  inboxAttachmentGetResultSchema,
  inboxClassifyPendingInputSchema,
  inboxClassifyPendingResultSchema,
  inboxSetStatusInputSchema,
  inboxSetStatusResultSchema,
  inboxSpaceMountInputSchema,
  inboxSpaceMountResultSchema,
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
import { resolveCallerSpaceIds } from "./caller-spaces.js";
import { fetchInboxAttachment } from "./fetch-attachment.js";

export interface RegisterInboxGatewayMethodsOptions {
  connectionsClient: ConnectionsModuleClient;
  getConnector: (connectorId: string) => ConnectorDefinition | undefined;
  /** Tenant-locked DB handle factory (for ai.config reads). */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  /** Repo bound to the caller: rows of the given Spaces only. */
  repoForAuth: (
    auth: PluginAuthContext | undefined,
    spaceIds: ReadonlySet<string>
  ) => InboxRepo;
  /** Service repo for the sync/bind path (no Space narrowing). */
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
    serviceRepoFor,
  } = options;

  /** The Spaces whose mail this caller may see (see `resolveCallerSpaceIds`). */
  async function callerSpaces(
    auth: PluginAuthContext | undefined
  ): Promise<ReadonlySet<string>> {
    if (!auth) {
      throw new Error("Inbox operations require an authenticated context");
    }
    return await resolveCallerSpaceIds(getDb(auth), auth);
  }

  /** The repo every mail read/write goes through: the caller's Spaces only. */
  async function callerRepo(
    auth: PluginAuthContext | undefined
  ): Promise<InboxRepo> {
    return repoForAuth(auth, await callerSpaces(auth));
  }

  /** An active connection of the tenant the caller's Spaces own, or throw. */
  async function callerConnection(
    auth: PluginAuthContext,
    connectionId: string
  ) {
    const [connections, spaces] = await Promise.all([
      connectionsClient.listConnections({ tenantId: auth.tenantId }),
      callerSpaces(auth),
    ]);
    const connection = connections.find(
      (candidate) =>
        candidate.id === connectionId && spaces.has(candidate.space_id)
    );
    if (!connection) {
      throw new Error(`inbox: unknown connection ${connectionId}`);
    }
    return connection;
  }

  async function inboxModel(auth: PluginAuthContext | undefined) {
    if (!auth) {
      throw new Error("Inbox AI operations require an authenticated context");
    }
    return resolveInboxAiModel({ auth, getDb });
  }

  /** The tenant's `classifier` binding (Jev or an LLM), or null without a credential. */
  async function inboxClassifier(auth: PluginAuthContext | undefined) {
    if (!auth) {
      throw new Error("Inbox AI operations require an authenticated context");
    }
    const classifier = await resolveModuleClassifier({
      scopeId: auth.scopeId ?? "default",
      tenantDb: getDb(auth),
      tenantId: auth.tenantId,
    });
    return classifier?.client ?? null;
  }

  async function inboxCategoryItems(auth: PluginAuthContext | undefined) {
    if (!auth) {
      throw new Error("Inbox AI operations require an authenticated context");
    }
    const config = await loadInboxCategories({ auth, getDb });
    return config.items;
  }

  // A mail thread lives in its mailbox's Space; the link lands there.
  const link = createRecordLinker(api);
  const threadLink = (
    auth: RecordLinkAuth | undefined,
    thread: { id: string; space_id: string }
  ) => link(auth, "inbox", [thread.id], thread.space_id);

  api.registerOperation({
    operationId: "inbox_threads_list",
    moduleId: "inbox",
    spacePolicy: {
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    },
    summary:
      "List inbox threads (account filter, status lanes, paging). In a Space, only that Space's mailboxes; a connection_id of another Space is not part of it.",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxThreadsListInputSchema,
    outputSchema: inboxThreadsListResultSchema,
    handler: async (input, ctx) => {
      const repo = await callerRepo(ctx.auth);
      const parsed = inboxThreadsListInputSchema.parse(input ?? {});
      const result = await repo.threads.listPaginated(parsed);
      return {
        ...result,
        threads: await withRecordLinks(result.threads, (thread) =>
          threadLink(ctx.auth, thread)
        ),
      };
    },
  });

  api.registerOperation({
    operationId: "inbox_thread_get",
    moduleId: "inbox",
    // Mail rows follow their mailbox's Space: narrowed to the caller's Spaces.
    spacePolicy: { kind: "account_mounted" },
    summary: "Get an inbox thread with all of its messages",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxThreadGetInputSchema,
    outputSchema: inboxThreadDetailSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = await callerRepo(ctx.auth);
      const parsed = inboxThreadGetInputSchema.parse(input);
      const thread = await repo.threads.getById(parsed.id);
      if (!thread) {
        return null;
      }
      const messages = await repo.messages.listByThread(thread.id);
      return {
        messages,
        thread: await withRecordLink(thread, (row) =>
          threadLink(ctx.auth, row)
        ),
      };
    },
  });

  api.registerOperation({
    operationId: "inbox_thread_digest_get",
    moduleId: "inbox",
    // Mail rows follow their mailbox's Space: narrowed to the caller's Spaces.
    spacePolicy: { kind: "account_mounted" },
    summary:
      "Get the optimized (AI-stripped) view of a thread: per-message digests, and — with include_summary — the thread status summary, participants and next actions",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    inputSchema: inboxThreadDigestGetInputSchema,
    outputSchema: inboxThreadDigestResultSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = await callerRepo(ctx.auth);
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
    // Mail rows follow their mailbox's Space: narrowed to the caller's Spaces.
    spacePolicy: { kind: "account_mounted" },
    summary: "Ask a question about one thread, grounded in its digests",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    inputSchema: inboxThreadChatInputSchema,
    outputSchema: inboxThreadChatResultSchema,
    handler: async (input, ctx) => {
      const repo = await callerRepo(ctx.auth);
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
    // Mail rows follow their mailbox's Space: narrowed to the caller's Spaces.
    spacePolicy: { kind: "account_mounted" },
    summary:
      "Classify messages that have no category yet (feeds the inbox category lanes)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxClassifyPendingInputSchema,
    outputSchema: inboxClassifyPendingResultSchema,
    handler: async (input, ctx) => {
      const repo = await callerRepo(ctx.auth);
      const parsed = inboxClassifyPendingInputSchema.parse(input ?? {});
      const pending = await repo.messages.listUnclassified(parsed.limit ?? 60);
      if (pending.length === 0) {
        return { classified: 0, remaining: 0 };
      }
      const categories = await classifyInboxMessages(
        pending,
        await inboxClassifier(ctx.auth),
        await inboxCategoryItems(ctx.auth)
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
    // Mail rows follow their mailbox's Space: narrowed to the caller's Spaces.
    spacePolicy: { kind: "account_mounted" },
    summary: "Set the mailbox status of inbox messages (new | read | archived)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxSetStatusInputSchema,
    outputSchema: inboxSetStatusResultSchema,
    handler: async (input, ctx) => {
      const repo = await callerRepo(ctx.auth);
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
    spacePolicy: { kind: "account_mounted" },
    summary:
      "List connected mail accounts with their inbox sync state. In a Space, this lists only the mailboxes that Space owns; a mailbox of another Space is not reachable here — connect one in this Space instead.",
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
      // A mailbox is its Space's: inside a Space this lists that Space's
      // mailboxes; a person outside one sees those of every Space they are a
      // member of (the settings page).
      const spaces = await callerSpaces(auth);
      const repo = repoForAuth(auth, spaces);
      const [connections, syncStates] = await Promise.all([
        connectionsClient.listConnections({ tenantId: auth.tenantId }),
        repo.syncState.list(),
      ]);
      const stateByConnection = new Map(
        syncStates.map((state) => [state.connection_id, state])
      );
      const accounts = connections
        .filter((connection) => spaces.has(connection.space_id))
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
          space_id: connection.space_id,
          stream_supported: true,
          sync_state: stateByConnection.get(connection.id) ?? null,
        }));
      return { accounts };
    },
  });

  api.registerOperation({
    operationId: "inbox_sync_settings_update",
    moduleId: "inbox",
    spacePolicy: {
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    },
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
      // Any member of the mailbox's Space may tune its sync.
      const connection = await callerConnection(auth, parsed.connection_id);
      const repo = await callerRepo(auth);
      return repo.syncState.upsertSettings(connection, {
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
    // Mail rows follow their mailbox's Space: narrowed to the caller's Spaces.
    spacePolicy: { kind: "account_mounted" },
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
        repo: await callerRepo(auth),
      });
    },
  });

  /**
   * Bind one mailbox to a Space's Inbox (PLAN-connections-ux.md B3b): the sync
   * state row is created and enabled, and one pull runs immediately. This is
   * what makes placing a mailbox END at "the mail is here" instead of at "two
   * rows exist".
   *
   * Idempotent, because the same pair can be re-added at any time: an existing
   * sync state is enabled rather than reset, so a mailbox re-added after being
   * removed does not re-download everything it already has.
   *
   * A failing first pull does NOT fail the binding. The account is placed, the
   * state row exists, and the next sync retries — reporting the error is more
   * useful than undoing a placement the user asked for.
   */
  async function bindMailbox(
    tenantId: string,
    connection: Awaited<
      ReturnType<ConnectionsModuleClient["listConnections"]>
    >[number]
  ): Promise<z.infer<typeof inboxAccountBindResultSchema>> {
    const connectionId = connection.id;
    // Streamless connectors can never carry mail. Answering "not bound"
    // beats writing a sync state row nothing will ever read.
    if (!getConnector(connection.connector_id)?.stream) {
      return {
        bound: false,
        connection_id: connectionId,
        new_messages: 0,
        skipped: "no_stream" as const,
        sync_error: null,
      };
    }
    const repo = serviceRepoFor(tenantId);
    const existing = await repo.syncState.get(connectionId);
    await repo.syncState.upsertSettings(connection, {
      // Only turn sync on when this is a new binding. A mailbox someone
      // deliberately paused must not restart because the Space was edited.
      ...(existing ? {} : { sync_enabled: true }),
    });
    const deps: InboxSyncDeps = {
      connectionsClient,
      hasMessageStream: (connectorId) =>
        Boolean(getConnector(connectorId)?.stream),
      repo,
      tenantId,
    };
    const run = await runInboxSync(deps, { connectionId });
    const result = run.connections[0];
    return {
      bound: true,
      connection_id: connectionId,
      new_messages: result?.new_messages ?? 0,
      skipped: result?.skipped ?? null,
      sync_error: result?.error ?? null,
    };
  }

  /**
   * An account connected in a Space where Inbox already is — the manifest names
   * this operation in `connections[].bindOperation`, and core calls it from
   * `POST /api/spaces/:id/setup/add` for that pair. When Inbox itself is being
   * mounted, `inbox_space_mount` binds every mailbox the space has instead.
   */
  api.registerOperation({
    operationId: "inbox_account_bind",
    moduleId: "inbox",
    spacePolicy: {
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    },
    summary:
      "Prepare one of this Space's mailboxes for its Inbox and pull it once",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxAccountBindInputSchema,
    outputSchema: inboxAccountBindResultSchema,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("inbox_account_bind requires authentication");
      }
      const parsed = inboxAccountBindInputSchema.parse(input ?? {});
      const connection = await callerConnection(auth, parsed.connection_id);
      return await bindMailbox(auth.tenantId, connection);
    },
  });

  /**
   * The module's `mountOperation` (engenty.plugin.json): core calls it with
   * `{ space_id }` from every path that mounts Inbox into a space — the create
   * wizard, the setup dialog, the `space_setup` tool. Every mailbox the space
   * already owns is bound here, the same way `inbox_account_bind` binds
   * one, so the wizard door ends at "the mail is here" too.
   *
   * A mailbox belongs to the Space that connected it, so readiness is only
   * whether the Space owns a mailbox at all: `needs: ["mailbox"]` until one
   * is connected there.
   */
  api.registerOperation({
    operationId: "inbox_space_mount",
    moduleId: "inbox",
    spacePolicy: { kind: "tenant_shared" },
    summary: "Set up this Space's Inbox (runs on mount)",
    description:
      "Runs automatically when Inbox is mounted into a space (space_setup action='add'): binds every mailbox the space owns and reports `needs: [\"mailbox\"]` while it has none. Idempotent. Not a tool to reach for — mount the module and this runs.",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxSpaceMountInputSchema,
    outputSchema: inboxSpaceMountResultSchema,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("inbox_space_mount requires authentication");
      }
      const parsed = inboxSpaceMountInputSchema.parse(input ?? {});
      const owned = await resolveSpaceRecordAccounts(
        getDb({ tenantId: auth.tenantId }),
        { spaceId: parsed.space_id, tenantId: auth.tenantId }
      );
      const connections = await connectionsClient.listConnections({
        tenantId: auth.tenantId,
      });
      const mailboxes = connections.filter(
        (connection) =>
          owned?.has(connection.id) &&
          Boolean(getConnector(connection.connector_id)?.stream)
      );
      const bound: z.infer<typeof inboxAccountBindResultSchema>[] = [];
      for (const connection of mailboxes) {
        bound.push(await bindMailbox(auth.tenantId, connection));
      }
      return {
        bound,
        needs: mailboxes.length > 0 ? [] : ["mailbox"],
        ready: mailboxes.length > 0,
      };
    },
  });

  api.registerOperation({
    operationId: "inbox_sync_run",
    moduleId: "inbox",
    spacePolicy: {
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    },
    summary:
      "Run the inbox sync now (the caller's stream-capable accounts, or one connection)",
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
      // The pull runs as the service. A person, or a run bound to a Space,
      // pulls their own Spaces' mailboxes; an unbound headless run (the sync
      // routine's heartbeat) pulls the tenant's.
      const scoped =
        Boolean(actorUserIdFromAuth(auth)) || Boolean(auth.spaceId?.trim());
      return runInboxSync(deps, {
        ...(scoped ? { spaceIds: await callerSpaces(auth) } : {}),
        ...(parsed.connection_id ? { connectionId: parsed.connection_id } : {}),
      });
    },
  });
}
