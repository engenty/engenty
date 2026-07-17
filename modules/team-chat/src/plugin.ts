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

  // AI surface: read/post tools for every agent (delegating to the ops above).
  const { invokeOperation } = createPluginServerGatewayCaller(server);
  server.registerAiRegistration?.(
    teamChatAiRegistration({ invokeTeamChatOperation: invokeOperation })
  );
};

export default registerTeamChatPlugin;
