// Registry stub for `message_agent`. Root conversation runs replace this with
// a child-run implementation (see conversation/message-agent-tool.ts). Leaf
// delegated specialists keep the stub so they return their result directly
// instead of nesting another conversation.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const MESSAGE_AGENT_TOOL_ID = "message_agent";

export const MESSAGE_AGENT_MODES = ["ask", "notify"] as const;
export type MessageAgentMode = (typeof MESSAGE_AGENT_MODES)[number];

/** How many agents a room holds (rooms/room-turns.ts carries the same cap). */
export const MESSAGE_AGENT_ROOM_MIN = 1;
export const MESSAGE_AGENT_ROOM_MAX = 6;

export const messageAgentInputSchema = z
  .object({
    agent_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        "One colleague: exact agent id from registry_agents_list or a live agent_propose result."
      ),
    agent_ids: z
      .array(z.string().min(1))
      .min(MESSAGE_AGENT_ROOM_MIN)
      .max(MESSAGE_AGENT_ROOM_MAX)
      .optional()
      .describe(
        "Colleagues to talk with in a room (one to six ids): the message goes to a room with all of them. In a room you are in, the missing ones are added; on a desk a new room opens with you as host. Every id listed takes one turn, in order. A room is a chat, never an app."
      ),
    message: z
      .string()
      .min(1)
      .describe(
        "Self-contained brief with the objective, necessary context, relevant record refs, and real artifact or file references. The specialist does not see this conversation."
      ),
    mode: z
      .enum(MESSAGE_AGENT_MODES)
      .default("ask")
      .describe(
        "`ask` (default): wait for the specialist's reply and use it here. `notify`: hand the next step over and continue — the message lands in the room you share (the room you are in when the specialist is a member of it, else your pair's room), the specialist takes the next turn there, and its answer stays there; check later with agent_status. Ignored with `agent_ids`: a message to several colleagues is always a room post."
      ),
    room_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Post in a room that ALREADY exists, by its thread id — the id an @-mentioned room carries. Every agent in it takes a turn, in order, unless `agent_ids` names which of them. You must be in that room. Use this instead of `agent_ids` whenever the person named a room, or you open a second room beside the one they meant."
      ),
    purpose: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe(
        "With `agent_ids`: one sentence on what the room is for. Every turn in the room reads it."
      ),
    title: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe(
        "With `agent_ids` on a desk: the new room's name. Defaults to the members' names."
      ),
    visibility: z
      .enum(["private", "space"])
      .optional()
      .describe(
        "With `agent_ids` on a desk: who may read the new room. `private` (default): the person you work for and the agents. `space`: everyone in the Space."
      ),
  })
  .refine(
    (input) =>
      (input.agent_id ? 1 : 0) + (input.agent_ids || input.room_id ? 1 : 0) ===
      1,
    "Pass agent_id for one colleague, or agent_ids / room_id for a room — never both."
  );

export const MESSAGE_AGENT_DESCRIPTION =
  "Message an available specialist, or several at once. Outside a shared room it does not see this chat, so send a self-contained brief with relevant record refs and real artifact or file references. `agent_id` + `ask` waits for the reply and returns it here; `agent_id` + `notify` hands the next step over — the message is posted in the room you share and the specialist takes the next turn there, while you continue at once. `agent_ids` (two to six) opens a room with all of them, or adds them to the room you are in, and posts the message there: each takes a turn. `room_id` posts in a room that already exists — use it whenever the person named one, so you speak in their room instead of opening another. A room is a chat with members, not an app — never suggest installing one for it. Opened from a direct message, the room is private and belongs to that person.";

export const messageAgentStubTool = createTool({
  id: MESSAGE_AGENT_TOOL_ID,
  description: MESSAGE_AGENT_DESCRIPTION,
  inputSchema: messageAgentInputSchema,
  execute: async () =>
    ({
      ok: false as const,
      code: "leaf_run",
      message:
        "This run is a leaf specialist — it cannot message other agents. Return the result directly with relevant record refs and real artifact or file references so the caller can pass it on.",
    }) as never,
});

export function createMessageAgentStubTools() {
  return { [MESSAGE_AGENT_TOOL_ID]: messageAgentStubTool };
}
