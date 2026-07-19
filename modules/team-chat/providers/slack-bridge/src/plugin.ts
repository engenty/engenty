// Team-chat Slack bridge (PRO): mirrors bound channels to a remote Slack
// workspace. Outbound rides the module-bus events the open module already
// emits (`team-chat.message.*`); inbound is a pull sync over the Slack
// connector's `get_channel_history` with a per-conversation cursor in the
// binding (`conversations.external.slack.sync_cursor`).
//
// Deviation from doc §14: no ConnectorStreamCapability — the SDK stream
// carries one cursor per CONNECTION and an email-shaped envelope, while this
// sync needs a cursor per CHANNEL and chat shapes; direct read actions fit.
//
// Approval note: the connector's write actions default to policy "ask"; for
// an unattended bridge the connection owner sets post_message/update_message
// to "allow" — otherwise replays park as durable approval requests.
import { createConnectionsModuleClient } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { createTeamChatRepoSupabase } from "@engenty/team-chat/dal";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  type BridgeDeps,
  enqueueOutbound,
  getConversationRow,
  listBoundConversations,
  runInboundSync,
  writeBinding,
} from "./bridge.js";

const logger = createLogger({ name: "team-chat-slack-bridge" });

const MODULE_ID = "team-chat-slack-bridge";
const MANAGE = ["module.team-chat.manage"];
const SYNC_INTERVAL_MS = Number(
  process.env.ENGENTY_TEAM_CHAT_SLACK_SYNC_INTERVAL_MS ?? 5 * 60_000
);

function bridgeEnabled(): boolean {
  return process.env.ENGENTY_TEAM_CHAT_SLACK_BRIDGE_ENABLED !== "false";
}

const channelRefInput = z.object({ channel: z.string().min(1) });

const bindInput = z.object({
  channel: z.string().min(1),
  connection_id: z.string().min(1),
  slack_channel_id: z.string().min(1),
  slack_channel_name: z.string().optional(),
});

const registerSlackBridgePlugin: EngentyPluginFactory = (engenty) => {
  const { events, server } = engenty;
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error("team-chat-slack-bridge requires Supabase");
  }
  const supabase = supabaseRaw as SupabaseClient;
  const connections = createConnectionsModuleClient(supabase, {
    moduleId: MODULE_ID,
  });

  // Imported messages go through the open module's DAL so ts identity,
  // thread rollups and module events behave exactly like local posts. The
  // event emitter matches the open module's — the search index (and future
  // subscribers) see imported messages too; the outbound handler's imported
  // guard keeps them from echoing back to Slack.
  const deps: BridgeDeps = {
    connections,
    postImported: async (input) => {
      const repo = createTeamChatRepoSupabase(
        supabase,
        input.tenantId,
        input.scopeId,
        null,
        {
          emitTeamChatEvent: async (verb, payload) => {
            await events.modules.emit(`team-chat.message.${verb}`, payload, {
              tenantId: payload.tenant_id,
            });
          },
        }
      );
      const message = await repo.messages.post({
        botId: input.botId,
        conversationId: input.conversationId,
        metadata: input.metadata,
        text: input.text,
        ...(input.threadTs ? { threadTs: input.threadTs } : {}),
      });
      return { ts: message.ts };
    },
    supabase,
  };

  // Outbound: replay module events for bound conversations.
  for (const verb of ["posted", "updated", "deleted"] as const) {
    events.modules.on(
      `team-chat.message.${verb}`,
      (payload: Record<string, unknown>) => {
        if (!bridgeEnabled()) {
          return;
        }
        const conversationId = payload.conversation_id as string | undefined;
        const messageTs = payload.message_ts as string | undefined;
        const tenantId = payload.tenant_id as string | undefined;
        if (conversationId && messageTs && tenantId) {
          enqueueOutbound(deps, verb, {
            conversation_id: conversationId,
            message_ts: messageTs,
            tenant_id: tenantId,
          });
        }
      }
    );
  }

  // Inbound: pull sync on an in-process interval (single core process; the
  // per-ts dedup makes overlapping runs harmless) + a manual op below.
  if (bridgeEnabled() && SYNC_INTERVAL_MS > 0) {
    const timer = setInterval(() => {
      runInboundSync(deps).catch((error) =>
        logger.warn("slack-bridge scheduled sync failed", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }, SYNC_INTERVAL_MS);
    timer.unref?.();
    logger.info("team-chat slack bridge started", {
      syncIntervalMs: SYNC_INTERVAL_MS,
    });
  } else {
    logger.info("team-chat slack bridge outbound-only or disabled", {
      enabled: bridgeEnabled(),
    });
  }

  // ── Management operations (channel binding + manual sync) ────────────────

  server.registerOperation({
    operationId: "team_chat_slack_status",
    moduleId: MODULE_ID,
    summary: "Slack-bridge binding status of a team-chat conversation",
    requiredCapabilities: MANAGE,
    riskLevel: "low",
    idempotent: true,
    inputSchema: channelRefInput,
    outputSchema: z.object({
      binding: z
        .object({
          channel_id: z.string(),
          channel_name: z.string().optional(),
          connection_id: z.string(),
          sync_cursor: z.string().optional(),
        })
        .nullable(),
      ok: z.literal(true),
    }),
    handler: async (input, ctx) => {
      const parsed = channelRefInput.parse(input);
      const row = await getConversationRow(supabase, parsed.channel);
      if (!row || row.tenant_id !== ctx.auth?.tenantId) {
        throw new Error("conversation not found");
      }
      const slack = (row.external?.slack ?? null) as {
        channel_id: string;
        channel_name?: string;
        connection_id: string;
        sync_cursor?: string;
      } | null;
      return { binding: slack, ok: true as const };
    },
  });

  server.registerOperation({
    operationId: "team_chat_slack_bind",
    moduleId: MODULE_ID,
    summary:
      "Bind a team-chat conversation to a Slack channel (two-way mirror via the Slack connection)",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: bindInput,
    outputSchema: z.object({ ok: z.literal(true) }),
    handler: async (input, ctx) => {
      const parsed = bindInput.parse(input);
      const row = await getConversationRow(supabase, parsed.channel);
      if (!row || row.tenant_id !== ctx.auth?.tenantId) {
        throw new Error("conversation not found");
      }
      await writeBinding(supabase, parsed.channel, {
        channel_id: parsed.slack_channel_id,
        connection_id: parsed.connection_id,
        ...(parsed.slack_channel_name
          ? { channel_name: parsed.slack_channel_name }
          : {}),
      });
      return { ok: true as const };
    },
  });

  server.registerOperation({
    operationId: "team_chat_slack_unbind",
    moduleId: MODULE_ID,
    summary: "Remove the Slack binding of a team-chat conversation",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: channelRefInput,
    outputSchema: z.object({ ok: z.literal(true) }),
    handler: async (input, ctx) => {
      const parsed = channelRefInput.parse(input);
      const row = await getConversationRow(supabase, parsed.channel);
      if (!row || row.tenant_id !== ctx.auth?.tenantId) {
        throw new Error("conversation not found");
      }
      await writeBinding(supabase, parsed.channel, null);
      return { ok: true as const };
    },
  });

  server.registerOperation({
    operationId: "team_chat_slack_sync_run",
    moduleId: MODULE_ID,
    summary: "Run the Slack inbound sync now (all bound channels or one)",
    requiredCapabilities: MANAGE,
    riskLevel: "low",
    inputSchema: z.object({ channel: z.string().optional() }).optional(),
    outputSchema: z.object({
      conversations: z.number(),
      errors: z.number(),
      imported: z.number(),
      ok: z.literal(true),
    }),
    handler: async (input, ctx) => {
      const parsed = z
        .object({ channel: z.string().optional() })
        .optional()
        .parse(input);
      if (parsed?.channel) {
        const row = await getConversationRow(supabase, parsed.channel);
        if (!row || row.tenant_id !== ctx.auth?.tenantId) {
          throw new Error("conversation not found");
        }
      }
      const summary = await runInboundSync(deps, {
        ...(parsed?.channel ? { conversationId: parsed.channel } : {}),
      });
      return { ...summary, ok: true as const };
    },
  });

  server.registerOperation({
    operationId: "team_chat_slack_bound_list",
    moduleId: MODULE_ID,
    summary: "List the tenant's Slack-bound team-chat conversations",
    requiredCapabilities: MANAGE,
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}).optional(),
    outputSchema: z.object({
      bound: z.array(
        z.object({
          channel_id: z.string(),
          channel_name: z.string().optional(),
          conversation_id: z.string(),
          sync_cursor: z.string().optional(),
        })
      ),
      ok: z.literal(true),
    }),
    handler: async (_input, ctx) => {
      const bound = await listBoundConversations(supabase);
      return {
        bound: bound
          .filter(({ row }) => row.tenant_id === ctx.auth?.tenantId)
          .map(({ binding, row }) => ({
            channel_id: binding.channel_id,
            conversation_id: row.id,
            ...(binding.channel_name
              ? { channel_name: binding.channel_name }
              : {}),
            ...(binding.sync_cursor
              ? { sync_cursor: binding.sync_cursor }
              : {}),
          })),
        ok: true as const,
      };
    },
  });
};

export default registerSlackBridgePlugin;
