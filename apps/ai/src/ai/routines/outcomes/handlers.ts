import { createLogger } from "@engenty/telemetry";
import type { ArtifactStore } from "../../../dal/artifacts/artifact-store.js";
import type { RoutineOutcomeRow } from "../../../dal/routines/routine-outcome-store.js";
import type { RoutineRow } from "../../../dal/routines/routine-store.js";
import type { ThreadStore } from "../../../dal/threads/thread-store.js";
import type { WorkflowRunStore } from "../../../dal/workflow-runs/workflow-run-store.js";
import { emitInboxNotification } from "../../../notifications/inbox.js";
import { speakOnDesk } from "../../threads/speak-on-desk.js";
import { resolveSpecialistChatThread } from "../../threads/specialist-chat-thread.js";
import { stableUuid } from "../../workflows/dispatch-published-run.js";
import type { OutcomeEnvelope } from "./envelope.js";
import { outcomeEnvelopeToWire } from "./envelope.js";
import {
  AGENT_MESSAGE_PROVIDER_ID,
  ARTIFACT_POINTER_PROVIDER_ID,
  DESK_CHAT_PROVIDER_ID,
  EMAIL_PROVIDER_ID,
  NOTIFICATION_HIGH_PROVIDER_ID,
  NOTIFICATION_UPDATE_PROVIDER_ID,
  WEBHOOK_PROVIDER_ID,
} from "./ids.js";

const logger = createLogger({ name: "routine-outcome-handlers" });

export type OutcomeOperationInvoker = (
  operationId: string,
  input: Record<string, unknown>
) => Promise<unknown>;

export interface OutcomeHandlerContext {
  artifacts?: Pick<ArtifactStore, "get"> | null;
  binding: RoutineOutcomeRow;
  envelope: OutcomeEnvelope;
  fetchImpl?: typeof fetch;
  invoke: OutcomeOperationInvoker;
  payload: Record<string, unknown>;
  requestId: string;
  routine: RoutineRow;
  threadStore?: ThreadStore | null;
  workflowRuns?: Pick<WorkflowRunStore, "setArtifactPointer"> | null;
}

export type OutcomeHandler = (ctx: OutcomeHandlerContext) => Promise<void>;

function proseOverride(
  payload: Record<string, unknown>,
  envelope: OutcomeEnvelope
): { body: string | null; summary: string | null } {
  const summary =
    typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim()
      : envelope.summary;
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : envelope.body;
  return { body, summary };
}

function deskText(ctx: OutcomeHandlerContext): string {
  const { body, summary } = proseOverride(ctx.payload, ctx.envelope);
  const prose = summary || body;
  const heading = `**Routine · ${ctx.envelope.routine_name}**`;
  if (ctx.envelope.status === "failed") {
    const reason = ctx.envelope.reason?.trim();
    return `${heading}\n\nRun failed${reason ? `: ${reason}` : "."}`;
  }
  const reviewLine = ctx.envelope.awaiting_review
    ? "\n\n⏸ Waiting for your review — this routine holds until you mark the run reviewed."
    : "";
  return prose
    ? `${heading}\n\n${prose}${reviewLine}`
    : `${heading}\n\n${ctx.envelope.reason?.trim() ?? "Run finished without a written result."}${reviewLine}`;
}

const deskChat: OutcomeHandler = async (ctx) => {
  const store = ctx.threadStore;
  if (!store) {
    throw new Error("desk.chat needs a thread store");
  }
  const destination = await resolveSpecialistChatThread({
    agentId: ctx.routine.agent_id,
    ownerUserId: ctx.routine.created_by_user_id,
    spaceId: ctx.routine.space_id,
    store,
    tenantId: ctx.routine.tenant_id,
    threadSeed: `routine-report-thread:${ctx.routine.id}`,
    title: ctx.routine.name,
  });
  if (!destination) {
    logger.info("desk.chat skipped — no owner chat", {
      routineId: ctx.routine.id,
      runId: ctx.envelope.run_id,
    });
    return;
  }
  await speakOnDesk({
    agentId: ctx.routine.agent_id,
    ...(ctx.envelope.artifact && ctx.envelope.status !== "failed"
      ? { artifact: ctx.envelope.artifact }
      : {}),
    messageId: stableUuid(
      `routine-outcome:${ctx.envelope.run_id}:${ctx.binding.id}`
    ),
    metadata: {
      outcome_id: ctx.binding.id,
      routine_id: ctx.routine.id,
      run_id: ctx.envelope.run_id,
      source: "routine-outcome",
    },
    notify: ctx.envelope.awaiting_review ? false : routineNotify(ctx),
    ownerUserId: ctx.routine.created_by_user_id,
    source: "routine-outcome",
    spaceId: ctx.routine.space_id,
    store,
    tenantId: ctx.routine.tenant_id,
    text: deskText(ctx),
    threadSeed: `routine-report-thread:${ctx.routine.id}`,
    title: ctx.routine.name,
  });
};

const agentMessage: OutcomeHandler = async (ctx) => {
  const store = ctx.threadStore;
  const targetId =
    typeof ctx.binding.config.agent_id === "string"
      ? ctx.binding.config.agent_id.trim()
      : "";
  if (!store) {
    throw new Error("agent.message needs a thread store");
  }
  if (!targetId) {
    throw new Error("agent.message is missing config.agent_id");
  }
  const text = `${deskText(ctx)}\n\n_Reported by ${ctx.routine.agent_id}._`;
  await speakOnDesk({
    agentId: targetId,
    messageId: stableUuid(
      `routine-outcome:${ctx.envelope.run_id}:${ctx.binding.id}:${targetId}`
    ),
    metadata: {
      from_agent_id: ctx.routine.agent_id,
      outcome_id: ctx.binding.id,
      routine_id: ctx.routine.id,
      run_id: ctx.envelope.run_id,
      source: "routine-outcome",
    },
    notify: routineNotify(ctx),
    ownerUserId: ctx.routine.created_by_user_id,
    source: "routine-outcome",
    spaceId: ctx.routine.space_id,
    store,
    tenantId: ctx.routine.tenant_id,
    text,
    threadSeed: `routine-report-thread:${ctx.routine.id}:${targetId}`,
    title: ctx.routine.name,
  });
};

/**
 * What a routine's report says in the inbox: 'Update from "<routine>"' and
 * the first line of its prose (or that it failed) — never the desk text's
 * heading, never an agent id.
 */
function outcomeLine(ctx: OutcomeHandlerContext): string {
  if (ctx.envelope.status === "failed") {
    return "Run failed";
  }
  const { body, summary } = proseOverride(ctx.payload, ctx.envelope);
  return summary?.trim() || body?.trim() || "Finished";
}

function routineNotify(ctx: OutcomeHandlerContext): {
  body: string;
  summary: string;
  title?: { key: "routine_outcome"; params: { name: string } };
} {
  const name = ctx.routine.name?.trim();
  const body = outcomeLine(ctx);
  return {
    body,
    summary: name ? `Update from "${name}"` : "Routine update",
    ...(name
      ? { title: { key: "routine_outcome" as const, params: { name } } }
      : {}),
  };
}

async function emitRoutineOutcome(
  ctx: OutcomeHandlerContext,
  priority: "low" | "urgent"
): Promise<void> {
  const spaceId = ctx.routine.space_id;
  if (!spaceId) {
    throw new Error("notification outcome needs a space on the routine");
  }
  const { body } = proseOverride(ctx.payload, ctx.envelope);
  const notify = routineNotify(ctx);
  await emitInboxNotification({
    actor: { id: ctx.routine.agent_id, kind: "agent" },
    audience: { kind: "space", spaceId },
    dedupeKey: `routine_outcome:${ctx.envelope.run_id}:${ctx.binding.id}`,
    kind: "routine_outcome",
    metadata: {
      // The row opens the result itself when the run stored one.
      ...(ctx.envelope.artifact
        ? { artifact_id: ctx.envelope.artifact.id }
        : {}),
      outcome_id: ctx.binding.id,
      provider_id: ctx.binding.provider_id,
      routine_id: ctx.routine.id,
      // The row opens the routine's chat on its Engenty's desk, with this
      // run open beside it.
      ...(ctx.envelope.graph_run_id
        ? { run_id: ctx.envelope.graph_run_id }
        : {}),
      thread_agent_id: ctx.routine.agent_id,
      thread_id: ctx.envelope.thread_id,
      ...(ctx.routine.workflow_id
        ? { workflow_id: ctx.routine.workflow_id }
        : {}),
    },
    ownerUserId: ctx.routine.created_by_user_id,
    payload: {
      body: body ?? null,
      outcome: ctx.envelope.outcome,
    },
    priority,
    source: "routines",
    spaceId,
    subject: { id: ctx.routine.id, type: "routine" },
    // The prose's first line; the whole of it stays in the payload for the
    // outcome, not for the row.
    body: notify.body,
    summary: notify.summary,
    tenantId: ctx.routine.tenant_id,
    ...(notify.title ? { title: notify.title } : {}),
  });
}

const notificationUpdate: OutcomeHandler = (ctx) =>
  emitRoutineOutcome(ctx, "low");

const notificationHigh: OutcomeHandler = (ctx) =>
  emitRoutineOutcome(ctx, "urgent");

const email: OutcomeHandler = async (ctx) => {
  const to =
    typeof ctx.binding.config.to === "string"
      ? ctx.binding.config.to.trim()
      : "";
  if (!to) {
    throw new Error("email outcome is missing a `to` address");
  }
  const accounts = (await ctx
    .invoke("connections_list_accounts", { connector_id: "google-gmail" })
    .catch(() => ({ accounts: [] }))) as {
    accounts?: { connection_id: string }[];
  };
  if (!accounts.accounts?.length) {
    throw new Error("no google-gmail connection in this routine's space");
  }
  const { body, summary } = proseOverride(ctx.payload, ctx.envelope);
  const subject =
    (typeof ctx.payload.subject === "string" && ctx.payload.subject.trim()) ||
    `Routine · ${ctx.routine.name}`;
  const bodyText =
    body?.trim() ||
    summary?.trim() ||
    (ctx.envelope.status === "failed"
      ? ctx.envelope.reason?.trim() || "Run failed."
      : "Run finished.");
  await ctx.invoke("gmail_send_message", {
    body_text: bodyText,
    subject: subject.slice(0, 140),
    to: [to],
  });
};

const artifactPointer: OutcomeHandler = async (ctx) => {
  const payloadId =
    typeof ctx.payload.artifact_id === "string"
      ? ctx.payload.artifact_id.trim()
      : "";
  const envelopeId = ctx.envelope.artifact?.id ?? "";
  const artifactId = payloadId || envelopeId;
  if (!artifactId) {
    throw new Error(
      "artifact.pointer needs an artifact_id on the payload or envelope"
    );
  }
  let title =
    (typeof ctx.payload.title === "string" && ctx.payload.title.trim()) ||
    ctx.envelope.artifact?.title ||
    artifactId;
  if (ctx.artifacts && payloadId) {
    const loaded = await ctx.artifacts.get({
      artifactId,
      tenantId: ctx.routine.tenant_id,
    });
    if (loaded?.artifact.title) {
      title = loaded.artifact.title;
    }
  }
  const pointer = { id: artifactId, title };
  ctx.envelope.artifact = pointer;
  if (!ctx.workflowRuns) {
    throw new Error("artifact.pointer needs the workflow run store");
  }
  await ctx.workflowRuns.setArtifactPointer({
    id: ctx.requestId,
    pointer,
    tenantId: ctx.routine.tenant_id,
  });
};

const webhook: OutcomeHandler = async (ctx) => {
  const url =
    typeof ctx.binding.config.url === "string"
      ? ctx.binding.config.url.trim()
      : "";
  if (!url) {
    throw new Error("webhook outcome is missing a url");
  }
  const secret =
    typeof ctx.binding.config.secret === "string"
      ? ctx.binding.config.secret
      : "";
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    body: JSON.stringify({
      envelope: outcomeEnvelopeToWire(ctx.envelope),
      payload: ctx.payload,
    }),
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-engenty-webhook-secret": secret } : {}),
    },
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`webhook responded ${response.status}`);
  }
};

export const BUILTIN_OUTCOME_HANDLERS: Record<string, OutcomeHandler> = {
  [AGENT_MESSAGE_PROVIDER_ID]: agentMessage,
  [ARTIFACT_POINTER_PROVIDER_ID]: artifactPointer,
  [DESK_CHAT_PROVIDER_ID]: deskChat,
  [EMAIL_PROVIDER_ID]: email,
  [NOTIFICATION_HIGH_PROVIDER_ID]: notificationHigh,
  [NOTIFICATION_UPDATE_PROVIDER_ID]: notificationUpdate,
  [WEBHOOK_PROVIDER_ID]: webhook,
};
