// Inbox AI surface — tools delegate to registered operations
// (capability gating + audit for free) and never touch the DB.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  composeInboxDashboardSurface,
  dashboardUiResult,
  LIST_LIMIT,
} from "./inbox-dashboard.js";

interface InboxAiOptions {
  invokeInboxOperation: PluginServerGatewayCaller["invokeOperation"];
}

const INBOX_SHOW_DASHBOARD_TOOL_ID = "inbox_show_dashboard";
const INBOX_LIST_THREADS_TOOL_ID = "inbox_list_threads";
const INBOX_GET_THREAD_TOOL_ID = "inbox_get_thread";
const INBOX_SET_STATUS_TOOL_ID = "inbox_set_status";
const INBOX_LIST_ACCOUNTS_TOOL_ID = "inbox_list_accounts";
const INBOX_SYNC_NOW_TOOL_ID = "inbox_sync_now";
const INBOX_UPDATE_SYNC_SETTINGS_TOOL_ID = "inbox_update_sync_settings";

const inboxMessageStatusSchema = z.enum(["new", "read", "archived"]);

function defineInboxAi(options: InboxAiOptions) {
  const invoke = options.invokeInboxOperation;
  return defineModuleAi({
    dir: import.meta.url,
    moduleId: "inbox",
    tools: {
      [INBOX_SHOW_DASHBOARD_TOOL_ID]: createTool({
        id: INBOX_SHOW_DASHBOARD_TOOL_ID,
        description:
          "Compose a native inbox dashboard in the chat (KPI tiles, category donut, volume chart, top senders, important-mail list). Jev picks the layout; numbers come from synced threads. Use when the person asks to see important mail, an inbox overview, or a mail dashboard — do not author the UI yourself.",
        inputSchema: z.object({
          connection_id: z.string().optional(),
          prompt: z
            .string()
            .max(500)
            .optional()
            .describe("The person's request, for layout choice."),
        }),
        execute: async (input) => {
          const listed = (await invoke("inbox_threads_list", {
            ...(input.connection_id
              ? { connection_id: input.connection_id }
              : {}),
            limit: LIST_LIMIT,
          })) as { threads?: unknown[] } | null;
          const threads = Array.isArray(listed?.threads) ? listed.threads : [];
          const surface = await composeInboxDashboardSurface({
            ...(input.connection_id
              ? { connection_id: input.connection_id }
              : {}),
            prompt: input.prompt?.trim() || "Show me important emails",
            threads: threads as never,
          });
          return dashboardUiResult(surface);
        },
      }),
      [INBOX_LIST_THREADS_TOOL_ID]: createTool({
        id: INBOX_LIST_THREADS_TOOL_ID,
        description:
          "List synced inbox threads for mailbox lanes (new/read/archived), optionally filtered by connection_id. Returns subjects, senders, snippets, and unhandled_count (unread = status new) — often enough to summarize without opening threads. For content questions (“anything from Acme?”) prefer the catalog op inbox_message_search via engenty_tools_search / engenty_tool_execute instead of paging lists.",
        inputSchema: z.object({
          connection_id: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
          offset: z.number().int().min(0).optional(),
          status: inboxMessageStatusSchema.optional(),
        }),
        execute: async (input) => invoke("inbox_threads_list", input),
      }),
      [INBOX_GET_THREAD_TOOL_ID]: createTool({
        id: INBOX_GET_THREAD_TOOL_ID,
        description:
          "Load one synced thread with all messages and bodies. Bodies can be long — use after list or search has identified the thread, not for browsing. Prefer inbox_list_threads or inbox_message_search first.",
        inputSchema: z.object({
          id: z.string().min(1),
        }),
        execute: async (input) => invoke("inbox_thread_get", input),
      }),
      [INBOX_SET_STATUS_TOOL_ID]: createTool({
        id: INBOX_SET_STATUS_TOOL_ID,
        description:
          "Bulk-set mailbox status on synced messages (message ids, not thread ids). Statuses: new (unread), read, archived. Affects only the synced copy — never the provider mailbox. Safe and reversible.",
        inputSchema: z.object({
          ids: z.array(z.string().min(1)).min(1).max(200),
          status: inboxMessageStatusSchema,
        }),
        execute: async (input) => invoke("inbox_set_status", input),
      }),
      [INBOX_LIST_ACCOUNTS_TOOL_ID]: createTool({
        id: INBOX_LIST_ACCOUNTS_TOOL_ID,
        description:
          "List connected mail accounts visible to the current user, with sync state (sync_enabled, backfill_days, last_synced_at, last_error). Start here for “is my email connected?” or empty-inbox diagnosis.",
        inputSchema: z.object({}),
        execute: async () => invoke("inbox_accounts_list", {}),
      }),
      [INBOX_SYNC_NOW_TOOL_ID]: createTool({
        id: INBOX_SYNC_NOW_TOOL_ID,
        description:
          "Run inbox sync now. Pass connection_id to sync one account; omit it to sync all stream-capable accounts with sync enabled.",
        inputSchema: z.object({
          connection_id: z.string().optional(),
        }),
        execute: async ({ connection_id }) =>
          invoke(
            "inbox_sync_run",
            connection_id === undefined ? {} : { connection_id }
          ),
      }),
      [INBOX_UPDATE_SYNC_SETTINGS_TOOL_ID]: createTool({
        id: INBOX_UPDATE_SYNC_SETTINGS_TOOL_ID,
        description:
          "Update sync settings for a mail connection (toggle sync_enabled, set backfill_days). Only mailboxes of the caller's Space(s) — the operation enforces that; surface errors instead of pre-checking.",
        inputSchema: z.object({
          backfill_days: z.number().int().min(1).max(3650).optional(),
          connection_id: z.string().min(1),
          sync_enabled: z.boolean().optional(),
        }),
        execute: async (input) => invoke("inbox_sync_settings_update", input),
      }),
    },
  });
}

export function inboxAiRegistration(options: InboxAiOptions): AiRegistration {
  return defineInboxAi(options).aiRegistration();
}

export function inboxDynamicAiCapability(
  options: InboxAiOptions
): DynamicAiModuleCapability {
  return defineInboxAi(options).dynamicCapability();
}
