// Chat slash-command catalog.
//   GET /ai/v1/chat-commands — serializable `prompt`/`action` command catalog
//     for the caller (enabled modules only, optionally filtered by agent via
//     `?agent_id=`). `ui`-kind commands are client-side contributions and never
//     appear here. Templates stay server-side: the response carries display
//     metadata only.

import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import type { Hono } from "hono";
import {
  filterChatCommandsForAgent,
  listAllChatCommands,
} from "../ai/chat-commands.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export interface RegisterChatCommandRoutesOptions {
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  scopeResolver: AiScopeResolver;
}

export function registerChatCommandRoutes(
  app: Hono<any>,
  options: RegisterChatCommandRoutesOptions
) {
  const { moduleLoader, scopeResolver } = options;

  app.get(`${AI_BASE_PATH}/v1/chat-commands`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const agentId = c.req.query("agent_id") ?? null;
      const all = await listAllChatCommands(
        moduleLoader,
        resolved.scope.tenantId
      );
      const commands = filterChatCommandsForAgent(all, agentId).map(
        (command) => ({
          args: command.args ?? [],
          command: command.command,
          description: command.description ?? null,
          description_key: command.description_key ?? null,
          id: command.id,
          kind: command.kind,
          label: command.label ?? null,
          label_key: command.label_key ?? null,
          module_id: command.module_id,
          order: command.order ?? null,
          surface: command.surface ?? null,
          // Only a wizard's target is the client's business: it presses the
          // stored workflow itself. Module commands run inside a chat turn.
          workflow_id:
            command.surface === "wizard" ? (command.workflow_id ?? null) : null,
        })
      );
      return c.json({ commands });
    } catch (error) {
      return handleRouteError(
        c,
        "chat_commands_list_failed",
        "chat_commands_list_failed",
        error
      );
    }
  });
}
