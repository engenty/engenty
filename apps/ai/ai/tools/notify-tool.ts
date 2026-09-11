// notify: an Engenty raises something for people, into a named stream.
//
// A stream is a shared work queue a team watches (the leads queue, the
// support escalations), with routes out to real channels. The tool is
// emit-only by construction — reading the inbox is a person's job, and the
// built-in Mastra notification tool's `read` wakes agent threads, which is
// exactly what this must never do.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

export const NOTIFY_TOOL_ID = "notify";

export const notifyTool = createTool({
  id: NOTIFY_TOOL_ID,
  description:
    "Raise something for the people watching a notification stream — an " +
    "escalation they must handle (kind 'escalation') or an FYI (kind " +
    "'update'). Name the stream by its key (e.g. 'support-escalations', " +
    "'leads'); a stream that does not exist is an error, never a silent drop.",
  inputSchema: z.object({
    stream_key: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
      .describe("the stream's key, kebab-case"),
    summary: z
      .string()
      .min(3)
      .max(500)
      .describe("one line: what happened and what a person should do"),
    kind: z
      .enum(["escalation", "update"])
      .default("escalation")
      .describe("'escalation' asks for a person; 'update' is FYI"),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    details: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("structured context the card shows (ids, amounts, links)"),
    subject: z
      .object({ id: z.string().min(1), type: z.string().min(1) })
      .optional()
      .describe("what this is about, e.g. { type: 'task', id }"),
  }),
  execute: async (input) => {
    const ctx = getEngentyToolsRunContext();
    const tenantId = ctx.tenantId ?? undefined;
    if (!tenantId) {
      return {
        ok: false as const,
        code: "unauthorized",
        message: "notify is unavailable in this run (no tenant scope).",
      };
    }
    const spaceId =
      ctx.space && !isUnresolvedSpaceGate(ctx.space) ? ctx.space.spaceId : null;
    try {
      const record = await emitInboxNotification({
        actor: { id: ctx.agentId ?? ctx.agentTypeKey ?? null, kind: "agent" },
        audience: { key: input.stream_key, kind: "stream" },
        initiatorUserId: ctx.userId ?? null,
        kind:
          input.kind === "escalation" ? "stream_escalation" : "stream_update",
        metadata: {
          ...(ctx.runId ? { run_id: ctx.runId } : {}),
          stream_key: input.stream_key,
        },
        ...(input.details ? { payload: input.details } : {}),
        priority: input.priority,
        source: "engenties",
        spaceId,
        ...(input.subject ? { subject: input.subject } : {}),
        summary: input.summary,
        tenantId,
      });
      if (!record) {
        return {
          ok: false as const,
          code: "notify_failed",
          message: `Could not raise this on stream "${input.stream_key}" — does the stream exist?`,
        };
      }
      return {
        ok: true as const,
        notification_id: record.id,
        stream_key: input.stream_key,
      };
    } catch (err) {
      return {
        ok: false as const,
        code: "notify_failed",
        message: err instanceof Error ? err.message : "notify failed",
      };
    }
  },
});

export function createNotifyTools() {
  return { [NOTIFY_TOOL_ID]: notifyTool };
}
