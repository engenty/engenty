import type {
  EngentyPluginFactory,
  EntityEventPayload,
  PluginAuthContext,
} from "@engenty/plugin-sdk";
import { createPluginServerGatewayCaller } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { teamChatAiRegistration } from "../ai/registrar.js";
import { registerTeamChatGatewayMethods } from "./api/gateway-methods.js";
import type { EmitTeamChatEvent } from "./dal/contracts.js";
import { createTeamChatRepoSupabase } from "./dal/supabase.js";

type TeamChatEntityPayload = EntityEventPayload<"message_ts"> & {
  conversation_id: string;
};

const registerTeamChatPlugin: EngentyPluginFactory = (engenty) => {
  engenty.server.registerRoleProfiles([
    {
      id: "team-chat.member",
      title: "Team chat member",
      capabilities: [
        "module.team-chat",
        "module.team-chat.read",
        "module.team-chat.write",
      ],
    },
    {
      id: "team-chat.manager",
      title: "Team chat manager",
      capabilities: [
        "module.team-chat",
        "module.team-chat.read",
        "module.team-chat.write",
        "module.team-chat.manage",
      ],
    },
  ]);

  const { events, server } = engenty;
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      "Team-chat module requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
    );
  }
  const supabase = supabaseRaw as SupabaseClient;

  // `posted` is the activity/bridge/search feed; verbs mirror the Slack
  // Events API semantics (message / message_changed / message_deleted).
  const emitTeamChatEvent: EmitTeamChatEvent = async (verb, payload) => {
    await events.modules.emit<TeamChatEntityPayload>(
      `team-chat.message.${verb}` as const,
      payload satisfies TeamChatEntityPayload,
      { tenantId: payload.tenant_id }
    );
  };

  const repoForAuth = (auth: PluginAuthContext | undefined) => {
    if (!auth) {
      throw new Error("Team-chat operations require an authenticated context");
    }
    const userId =
      (auth as PluginAuthContext & { userId?: string }).userId ??
      auth.principalId ??
      null;
    return createTeamChatRepoSupabase(
      supabase,
      auth.tenantId,
      auth.scopeId ?? "default",
      userId,
      { emitTeamChatEvent }
    );
  };

  const queue = server.getQueueService?.() ?? null;
  registerTeamChatGatewayMethods(server, { queue, repoForAuth });

  // Project activity feed (Phase 4): task activity from the tasks module bus
  // becomes a system message in the bound project channel.
  events.modules.on(
    "tasks.task.activity",
    async (payload: Record<string, unknown>) => {
      try {
        const contexts = (payload.contexts ?? []) as {
          context_id: string;
          context_type: string;
        }[];
        const project = contexts.find(
          (context) => context.context_type === "project"
        );
        const tenantId = payload.tenant_id as string | undefined;
        if (!(project && tenantId)) {
          return;
        }
        const serviceRepo = createTeamChatRepoSupabase(
          supabase,
          tenantId,
          (payload.scope_id as string) ?? "default",
          null,
          { emitTeamChatEvent }
        );
        const conversation = await serviceRepo.conversations.findByProject(
          project.context_id
        );
        if (
          !conversation ||
          (conversation.settings as { activity?: { enabled?: boolean } })
            .activity?.enabled === false
        ) {
          return;
        }
        const detail = (payload.payload ?? {}) as Record<string, unknown>;
        // Human-readable line: verb + title/transition when the payload has them.
        const verb = String(payload.event_type).replace(/^tasks\./, "");
        const parts = [
          `Task ${verb.replaceAll("_", " ")}`,
          typeof detail.title === "string" ? `"${detail.title}"` : null,
          typeof detail.from === "string" && typeof detail.to === "string"
            ? `${detail.from} → ${detail.to}`
            : null,
          typeof detail.comment === "string"
            ? `“${String(detail.comment).slice(0, 120)}”`
            : null,
        ].filter(Boolean);
        await serviceRepo.messages.post({
          conversationId: conversation.id,
          metadata: {
            event_payload: {
              event: payload.event_type,
              task_id: payload.task_id,
            },
            event_type: "task_activity",
          },
          subtype: "activity",
          text: parts.join(" · "),
        });
      } catch {
        // activity fan-out is best-effort
      }
    }
  );

  // AI surface: read/post tools for every agent (delegating to the ops above).
  const { invokeOperation } = createPluginServerGatewayCaller(server);
  server.registerAiRegistration?.(
    teamChatAiRegistration({ invokeTeamChatOperation: invokeOperation })
  );
};

export default registerTeamChatPlugin;
