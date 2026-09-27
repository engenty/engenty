// Chat slash-command catalog.
//   GET /ai/v1/chat-commands — serializable `prompt`/`action` command catalog
//     for the caller (enabled modules only, optionally filtered by agent via
//     `?agent_id=`, and — with `?space_id=` for a Space desk — to the commands
//     whose `required_tools` that agent holds there). `ui`-kind commands are
//     client-side contributions and never appear here. Templates stay server-side: the response carries display
//     metadata only.

import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import type { Hono } from "hono";
import { z } from "zod";
import {
  filterChatCommandsForAgent,
  filterChatCommandsForTools,
  listAllChatCommands,
} from "../ai/chat-commands.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export interface RegisterChatCommandRoutesOptions {
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  /** The agent's runtime tool ids (in the Space when given); null = unknown agent. */
  resolveAgentToolIds?: (input: {
    agentId: string;
    scope: AiSessionScope;
    spaceId: string | null;
  }) => Promise<ReadonlySet<string> | null>;
  scopeResolver: AiScopeResolver;
}

const spaceIdSchema = z.string().uuid();

export function registerChatCommandRoutes(
  app: Hono<any>,
  options: RegisterChatCommandRoutesOptions
) {
  const { moduleLoader, resolveAgentToolIds, scopeResolver } = options;

  app.get(`${AI_BASE_PATH}/v1/chat-commands`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const agentId = c.req.query("agent_id") ?? null;
      const spaceIdRaw = c.req.query("space_id")?.trim() || null;
      const spaceId = spaceIdRaw ? spaceIdSchema.safeParse(spaceIdRaw) : null;
      if (spaceId && !spaceId.success) {
        return c.json({ error: "chat_commands_invalid_space_id" }, 400);
      }
      const all = await listAllChatCommands(
        moduleLoader,
        resolved.scope.tenantId
      );
      const toolIds =
        agentId && resolveAgentToolIds
          ? await resolveAgentToolIds({
              agentId,
              scope: resolved.scope,
              spaceId: spaceId?.data ?? null,
            })
          : null;
      const commands = filterChatCommandsForTools(
        filterChatCommandsForAgent(all, agentId),
        toolIds
      ).map((command) => ({
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
      }));
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
