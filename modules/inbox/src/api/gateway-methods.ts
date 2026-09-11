import type {
  ConnectionsModuleClient,
  ConnectorDefinition,
} from "@engenty/connections-sdk";
import { resolveSpaceRecordAccounts } from "@engenty/connections-sdk";
import {
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
  /**
   * Repo bound to the caller (owner visibility applied). The optional grant
   * set widens visibility to the acting agent's granted connections (CN.5) —
   * pass it only on paths where the agent reads mailbox rows.
   */
  repoForAuth: (
    auth: PluginAuthContext | undefined,
    grantedConnectionIds?: ReadonlySet<string>,
    /** Mailboxes the run's space placed (E1). Null/absent ⇒ do not narrow. */
    spaceConnectionIds?: ReadonlySet<string> | null
  ) => InboxRepo;
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

  /**
   * The connections the acting AGENT was granted (CN.5), or null for a plain
   * user call. Read off `auth.agentId` — the core.agents principal uuid the
   * grant rows store, forwarded as x-engenty-agent-id on agent-driven calls —
   * so a headless run sees the mailboxes it was deliberately granted, and
   * nothing else changes for anyone.
   */
  async function agentGrantSet(
    auth: PluginAuthContext | undefined
  ): Promise<ReadonlySet<string> | undefined> {
    const agentId = auth?.agentId?.trim();
    if (!(auth && agentId)) {
      return;
    }
    return connectionsClient.listAgentGrantedConnectionIds({
      agentId,
      tenantId: auth.tenantId,
    });
  }

  /**
   * The mailboxes the run's space placed, or null when there is no space to
   * narrow to (PLAN-connections-ux.md E1).
   *
   * Null when the mounts cannot be read, deliberately: the mount is a
   * narrowing, and a core hiccup must not empty every space's inbox at once.
   * Core re-checks a call that names an account, so the window costs a stale
   * LIST, never a stale permission.
   */
  async function spaceConnectionIds(
    auth: PluginAuthContext | undefined
  ): Promise<ReadonlySet<string> | null> {
    if (!auth) {
      return null;
    }
    return await resolveSpaceRecordAccounts(
      getDb({ tenantId: auth.tenantId }),
      {
        spaceId: auth.spaceId,
        tenantId: auth.tenantId,
      }
    );
  }

  /**
   * The repo every mail READ goes through: the acting agent's granted
   * mailboxes widen it, the run's space narrows it. Both resolved here so no
   * operation can accidentally get one rule and not the other.
   */
  async function agentAwareRepo(
    auth: PluginAuthContext | undefined
  ): Promise<InboxRepo> {
    const [granted, space] = await Promise.all([
      agentGrantSet(auth),
      spaceConnectionIds(auth),
    ]);
    return repoForAuth(auth, granted, space);
  }

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

  // A mail thread has no space of its own; the link lands in the space the
  // call runs in, where the mailbox is mounted.
  const link = createRecordLinker(api);
  const threadLink = (
    auth: RecordLinkAuth | undefined,
    thread: { id: string }
  ) => link(auth, "inbox", [thread.id]);

  api.registerOperation({
    operationId: "inbox_threads_list",
    moduleId: "inbox",
    spacePolicy: {
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    },
    summary:
      "List inbox threads (account filter, status lanes, paging). In a Space, pass a mounted mailbox connection_id; an unmounted account is not part of this Space.",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxThreadsListInputSchema,
    outputSchema: inboxThreadsListResultSchema,
    handler: async (input, ctx) => {
      const repo = await agentAwareRepo(ctx.auth);
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
    // Mail rows are narrowed to the mailboxes this space placed (E1), so the
    // contract is the account mount — not "any row this user owns".
    spacePolicy: { kind: "account_mounted" },
    summary: "Get an inbox thread with all of its messages",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: inboxThreadGetInputSchema,
    outputSchema: inboxThreadDetailSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = await agentAwareRepo(ctx.auth);
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
    // Mail rows are narrowed to the mailboxes this space placed (E1), so the
    // contract is the account mount — not "any row this user owns".
    spacePolicy: { kind: "account_mounted" },
    summary:
      "Get the optimized (AI-stripped) view of a thread: per-message digests, and — with include_summary — the thread status summary, participants and next actions",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    inputSchema: inboxThreadDigestGetInputSchema,
    outputSchema: inboxThreadDigestResultSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = await agentAwareRepo(ctx.auth);
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
    // Mail rows are narrowed to the mailboxes this space placed (E1), so the
    // contract is the account mount — not "any row this user owns".
    spacePolicy: { kind: "account_mounted" },
    summary: "Ask a question about one thread, grounded in its digests",
    requiredCapabilities: ["module.inbox.read"],
    riskLevel: "low",
    inputSchema: inboxThreadChatInputSchema,
    outputSchema: inboxThreadChatResultSchema,
    handler: async (input, ctx) => {
      const repo = await agentAwareRepo(ctx.auth);
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
    // Mail rows are narrowed to the mailboxes this space placed (E1), so the
    // contract is the account mount — not "any row this user owns".
    spacePolicy: { kind: "account_mounted" },
    summary:
      "Classify messages that have no category yet (feeds the inbox category lanes)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxClassifyPendingInputSchema,
    outputSchema: inboxClassifyPendingResultSchema,
    handler: async (input, ctx) => {
      // Mail rows, so the space narrows them like every other read (E1) —
      // classifying another space's backlog from here would be the same leak
      // the list had.
      const repo = await agentAwareRepo(ctx.auth);
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
    // Mail rows are narrowed to the mailboxes this space placed (E1), so the
    // contract is the account mount — not "any row this user owns".
    spacePolicy: { kind: "account_mounted" },
    summary: "Set the mailbox status of inbox messages (new | read | archived)",
    requiredCapabilities: ["module.inbox.write"],
    riskLevel: "low",
    inputSchema: inboxSetStatusInputSchema,
    outputSchema: inboxSetStatusResultSchema,
    handler: async (input, ctx) => {
      const repo = await agentAwareRepo(ctx.auth);
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
      "List connected mail accounts with their inbox sync state. In a Space, this lists only mounted mailboxes. An account that exists for the tenant but is absent here should be mounted in Space setup, not reconnected blindly.",
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
      // CN.5 — a personal mailbox its owner GRANTED to the acting agent is
      // this caller's business: a headless run carries no user at all
      // (service principal), so without the grant set every granted-and-
      // mounted personal account vanished from this list and the agent
      // reported "no mailbox connected" about the very account it was hired
      // to scan. Same rule the action policy applies at execution.
      const [connections, syncStates, agentGrantedIds] = await Promise.all([
        connectionsClient.listConnections({ tenantId: auth.tenantId }),
        repo.syncState.list(),
        agentGrantSet(auth),
      ]);
      const stateByConnection = new Map(
        syncStates.map((state) => [state.connection_id, state])
      );
      // PLAN-spaces.md CN.3 — inside a space, show that space's mailboxes. The
      // same rule the mail rows now use (E1/E2), read from the one place that
      // states it: filtering only, so a space id the caller has no claim to
      // cannot reveal anything, and null leaves the list as it was.
      const mounted = await spaceConnectionIds(auth);
      const accounts = connections
        // Personal accounts of other users are not this caller's business —
        // unless the owner granted the acting agent this account (CN.5).
        .filter(
          (connection) =>
            connection.sharing === "org" ||
            connection.owner_user_id === userId ||
            agentGrantedIds?.has(connection.id) === true
        )
        .filter((connection) => !mounted || mounted.has(connection.id))
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
    // Mail rows are narrowed to the mailboxes this space placed (E1), so the
    // contract is the account mount — not "any row this user owns".
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
        repo: repoForAuth(auth),
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
    await repo.syncState.upsertSettings(connectionId, {
      // A personal mailbox stays visible to its owner only; an org account
      // has no owner to scope it to. Same rule the sync path applies when it
      // creates the row lazily — stated in one more place because this one
      // creates it FIRST.
      owner_user_id:
        connection.sharing === "personal" ? connection.owner_user_id : null,
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
   * An account placed in a Space where Inbox already is — the manifest names
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
      "Prepare a mounted mailbox for this Space's Inbox and pull it once",
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
      const connections = await connectionsClient.listConnections({
        tenantId: auth.tenantId,
      });
      const connection = connections.find(
        (entry) => entry.id === parsed.connection_id
      );
      if (!connection) {
        throw new Error(`unknown connection ${parsed.connection_id}`);
      }
      return await bindMailbox(auth.tenantId, connection);
    },
  });

  /**
   * The module's `mountOperation` (engenty.plugin.json): core calls it with
   * `{ space_id }` from every path that mounts Inbox into a space — the create
   * wizard, the setup dialog, the `space_setup` tool. Every mailbox the space
   * has already placed is bound here, the same way `inbox_account_bind` binds
   * one, so the wizard door ends at "the mail is here" too.
   *
   * Inbox keeps no row per space (a mailbox's sync state is tenant-wide, and
   * which space sees its mail is the mount), so readiness is only whether the
   * space has a mailbox at all: `needs: ["mailbox"]` until one is placed.
   */
  api.registerOperation({
    operationId: "inbox_space_mount",
    moduleId: "inbox",
    spacePolicy: { kind: "tenant_shared" },
    summary: "Set up this Space's Inbox (runs on mount)",
    description:
      "Runs automatically when Inbox is mounted into a space (space_setup action='add'): binds every mailbox the space has placed and reports `needs: [\"mailbox\"]` while it has none. Idempotent. Not a tool to reach for — mount the module and this runs.",
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
      const placed = await resolveSpaceRecordAccounts(
        getDb({ tenantId: auth.tenantId }),
        { spaceId: parsed.space_id, tenantId: auth.tenantId }
      );
      const connections = await connectionsClient.listConnections({
        tenantId: auth.tenantId,
      });
      const mailboxes = connections.filter(
        (connection) =>
          placed?.has(connection.id) &&
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
