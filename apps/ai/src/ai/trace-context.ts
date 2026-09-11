// The identity every agent-run trace carries.
//
// Set once on the run's Mastra `RequestContext` at the seam that creates it
// (conversation, delegate, graph dispatch). Mastra copies the keys listed in
// the observability config's `requestContextKeys` onto the root span's
// metadata, from where every exporter reads them — Langfuse maps `userId` to
// its user and `sessionId` to its session; OTLP backends see them as
// `mastra.metadata.*` attributes. Plain key names on purpose: they are what
// Mastra's own docs use, and what the exporters look for.
import type { RequestContext } from "@mastra/core/request-context";

export const TRACE_CONTEXT_KEYS = [
  "tenantId",
  "userId",
  "sessionId",
  "threadId",
  "spaceId",
  "agentId",
  "runId",
  "lane",
] as const;

/** Which execution path started the run. */
export type TraceLane = "interactive" | "delegate" | "workflow";

export interface TraceContext {
  agentId?: string | null;
  lane: TraceLane;
  runId?: string | null;
  spaceId?: string | null;
  tenantId: string;
  threadId: string;
  userId?: string | null;
}

export function setTraceContext(
  requestContext: RequestContext,
  ctx: TraceContext
): void {
  requestContext.set("tenantId", ctx.tenantId);
  requestContext.set("threadId", ctx.threadId);
  // One desk conversation is one session in every backend that has the notion.
  requestContext.set("sessionId", ctx.threadId);
  requestContext.set("lane", ctx.lane);
  if (ctx.userId) {
    requestContext.set("userId", ctx.userId);
  }
  if (ctx.spaceId) {
    requestContext.set("spaceId", ctx.spaceId);
  }
  if (ctx.agentId) {
    requestContext.set("agentId", ctx.agentId);
  }
  if (ctx.runId) {
    requestContext.set("runId", ctx.runId);
  }
}
