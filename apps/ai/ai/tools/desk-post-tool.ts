// desk_post: an Engenty leaves a note on its own desk without being asked.
//
// The push half of proactive communication. A routine's settle report and a
// hire's welcome already post on the desk from the server side; this lets a
// run that learned something mid-work — a delegated child, a routine fire, a
// colleague's turn in a pair room — say so where the Space reads, instead of
// leaving it in a transcript nobody opens. The person who was not watching
// gets one `update` in the inbox.
//
// It posts on the CALLER's desk only. Talking to a colleague is
// `message_agent`; this is the agent speaking to the people in its Space.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createThreadStoreFromEnv } from "../../src/ai/index.js";
import { speakOnDesk } from "../../src/ai/threads/speak-on-desk.js";
import type { ThreadStore } from "../../src/dal/threads/thread-store.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

export const DESK_POST_TOOL_ID = "desk_post";

const MAX_CHARS = 2000;

export interface DeskPostToolDeps {
  /** Test seam; production reads the env-configured store. */
  threadStore?: () => ThreadStore | null;
}

export function createDeskPostTool(deps: DeskPostToolDeps = {}) {
  return createTool({
    id: DESK_POST_TOOL_ID,
    description:
      "Leave a short note on your own desk in this Space — the shared conversation everyone here reads — without waiting for someone to ask. Use it when work you were handed is done, when something needs a person's look, or when you learned something the Space should know now. One to three sentences, like a message in a team chat; long deliverables go to an artifact and the note names it. Not for talking to a colleague (use message_agent) and not a substitute for answering the person in front of you.",
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(MAX_CHARS)
        .describe("The note, as you would say it in the team chat."),
      notify: z
        .boolean()
        .optional()
        .describe(
          "Also put an update in the Space's inbox (default true). Off for a note that can wait until someone opens the desk."
        ),
    }),
    outputSchema: z.object({
      ok: z.literal(true),
      message_id: z.string(),
      thread_id: z.string(),
    }),
    execute: async ({ notify, text }) => {
      const ctx = getEngentyToolsRunContext();
      const tenantId = ctx.tenantId?.trim();
      const agentId = ctx.agentTypeKey?.trim();
      if (!(tenantId && agentId)) {
        throw new Error(
          "desk_post is unavailable in this run (no tenant or agent)."
        );
      }
      if (isUnresolvedSpaceGate(ctx.space)) {
        throw new Error(
          "desk_post: this run's Space could not be resolved; refusing."
        );
      }
      const spaceId = ctx.space?.spaceId;
      if (!spaceId) {
        throw new Error(
          "desk_post: only works inside a Space (your desk is per Space)."
        );
      }
      const store = (deps.threadStore ?? createThreadStoreFromEnv)();
      if (!store) {
        throw new Error("desk_post: thread store is not configured.");
      }
      const spoken = await speakOnDesk({
        agentId,
        notify: notify !== false,
        ownerUserId: ctx.userId?.trim() || null,
        source: "desk-post",
        spaceId,
        store,
        tenantId,
        text,
        ...(ctx.runId ? { metadata: { run_id: ctx.runId } } : {}),
      });
      if (!spoken) {
        throw new Error(
          "desk_post: nobody has opened your desk in this Space yet and this run has no person to open it for — say it in your reply instead."
        );
      }
      return {
        ok: true as const,
        message_id: spoken.messageId,
        thread_id: spoken.threadId,
      };
    },
  });
}

export function createDeskPostTools(deps: DeskPostToolDeps = {}) {
  return { [DESK_POST_TOOL_ID]: createDeskPostTool(deps) };
}
