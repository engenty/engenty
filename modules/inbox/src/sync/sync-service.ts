import type {
  ConnectionSummary,
  ConnectionsModuleClient,
} from "@engenty/connections-sdk";
import type { InboxRepo } from "../dal/contracts.js";
import type { InboxSyncRunResult } from "../schema/types.js";

const DEFAULT_PULL_LIMIT = 50;
// Pages per connection per run: bounds a single pulse; backfill resumes from
// the persisted cursor on the next heartbeat, so large mailboxes drain
// incrementally instead of monopolizing one run.
const DEFAULT_MAX_PAGES_PER_RUN = 5;
const DEFAULT_BACKFILL_DAYS = 90;

export interface InboxSyncDeps {
  connectionsClient: Pick<
    ConnectionsModuleClient,
    "listConnections" | "pullStream"
  >;
  /** Whether the connector declares a `messages` stream (registry lookup). */
  hasMessageStream: (connectorId: string) => boolean;
  log?: (message: string, data?: Record<string, unknown>) => void;
  maxPagesPerRun?: number;
  pullLimit?: number;
  /** Service-scoped repo (userId null — sync sees personal connections too). */
  repo: InboxRepo;
  tenantId: string;
}

function isCursorExpiredError(error: unknown): boolean {
  return (
    error instanceof Error && /(^|\W)[a-z_]*cursor_expired/i.test(error.message)
  );
}

function backfillSince(backfillDays: number): string {
  return new Date(Date.now() - backfillDays * 86_400_000).toISOString();
}

async function syncConnection(
  deps: InboxSyncDeps,
  connection: ConnectionSummary
): Promise<InboxSyncRunResult["connections"][number]> {
  const { connectionsClient, repo, tenantId } = deps;
  const log = deps.log ?? (() => undefined);
  const result: InboxSyncRunResult["connections"][number] = {
    connection_id: connection.id,
    error: null,
    new_messages: 0,
    skipped: null,
  };

  // `off` = visible no-op: consent for background reads lives on the
  // connection (autonomous_mode ≥ read_only), not here.
  if (connection.autonomous_mode === "off") {
    result.skipped = "autonomous_off";
    return result;
  }
  if (!deps.hasMessageStream(connection.connector_id)) {
    result.skipped = "no_stream";
    return result;
  }

  const state =
    (await repo.syncState.get(connection.id)) ??
    (await repo.syncState.upsertSettings(connection.id, {
      owner_user_id:
        connection.all_spaces === true ? null : connection.owner_user_id,
    }));
  if (!state.sync_enabled) {
    result.skipped = "sync_disabled";
    return result;
  }

  const backfillDays = state.backfill_days || DEFAULT_BACKFILL_DAYS;
  let cursor = state.cursor;
  let cursorWasReset = false;

  try {
    const maxPages = deps.maxPagesPerRun ?? DEFAULT_MAX_PAGES_PER_RUN;
    for (let page = 0; page < maxPages; page++) {
      let pull: Awaited<ReturnType<typeof connectionsClient.pullStream>>;
      try {
        pull = await connectionsClient.pullStream({
          connectionId: connection.id,
          cursor,
          limit: deps.pullLimit ?? DEFAULT_PULL_LIMIT,
          tenantId,
          ...(cursor === null ? { since: backfillSince(backfillDays) } : {}),
        });
      } catch (error) {
        // Expired incremental cursor (e.g. Gmail historyId older than ~7d):
        // restart from a null cursor once — dedup on provider_message_id
        // absorbs the overlap.
        if (isCursorExpiredError(error) && cursor !== null && !cursorWasReset) {
          log("inbox sync cursor expired — re-backfilling", {
            connectionId: connection.id,
          });
          cursor = null;
          cursorWasReset = true;
          page--;
          continue;
        }
        throw error;
      }

      const upserted = await repo.sync.upsertInbound(
        {
          id: connection.id,
          owner_user_id: connection.owner_user_id,
          sharing: connection.sharing,
        },
        pull.items
      );
      result.new_messages += upserted.new_messages;
      cursor = pull.nextCursor;
      // Persist after every page so an interrupted backfill resumes instead
      // of restarting.
      await repo.syncState.recordResult(connection.id, { cursor });
      if (!pull.hasMore) {
        break;
      }
    }
    await repo.syncState.recordResult(connection.id, {
      last_error: null,
      touch_synced_at: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.error = message;
    log("inbox sync failed for connection", {
      connectionId: connection.id,
      error: message,
    });
    await repo.syncState
      .recordResult(connection.id, { last_error: message })
      .catch(() => undefined);
  }
  return result;
}

/**
 * One sync pulse: iterate the tenant's active connections and pull each
 * stream-capable one. Failure isolation is per connection — one broken
 * account records its error on the sync_state row and never blocks others.
 */
export async function runInboxSync(
  deps: InboxSyncDeps,
  options: { connectionId?: string } = {}
): Promise<InboxSyncRunResult> {
  const all = await deps.connectionsClient.listConnections({
    tenantId: deps.tenantId,
  });
  const targets = options.connectionId
    ? all.filter((connection) => connection.id === options.connectionId)
    : all;
  const connections: InboxSyncRunResult["connections"] = [];
  for (const connection of targets) {
    connections.push(await syncConnection(deps, connection));
  }
  return { connections };
}
