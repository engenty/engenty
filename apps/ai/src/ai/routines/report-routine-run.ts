// What a routine tells the person who set it up.
//
// `ai.routines.report` has existed since the cutover — `quiet | desk_card |
// ask`, defaulted to `desk_card`, stored, validated, carried all the way into
// the UI — and nothing ever read it. A fire wrote its transcript into its own
// unattended thread and stopped there, so the only way to learn what a nightly
// routine had done was to go looking for it. Reporting back without being
// asked is the whole point of a routine, so the knob is now enforced here.
//
// The rule: when a fire settles, its result — or its failure — is posted as a
// message into the owner's chat with that specialist, the room the desk opens
// by default. The run keeps its own thread; this is a message ABOUT it, not a
// move of it, and the Runs tab stays the per-fire record either way.
//
// Enforced at settle rather than left to an in-run tool on purpose. A routine
// that reports only when the model remembers to call `comment` is a routine
// that goes quiet exactly when nobody is watching — which is the failure this
// replaces. (PLAN-specialist-routines-runs.md also sketches in-run desk tools;
// those compose with this, letting an agent report EARLY. They do not replace
// the guarantee that a fire says something at the end.)
import { createLogger } from "@engenty/telemetry";
import type {
  RoutineRow,
  RoutineStore,
} from "../../dal/routines/routine-store.js";
import type { ThreadStore } from "../../dal/threads/thread-store.js";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import { createThreadStoreFromEnv } from "../index.js";
import { resolveTaskJobServiceScope } from "../jobs/task-job-scope.js";
import { scopeAccessToken } from "../sessions/types.js";
import { speakOnDesk } from "../threads/speak-on-desk.js";
import { resolveSpecialistChatThread } from "../threads/specialist-chat-thread.js";
import { stableUuid } from "../workflows/dispatch-published-run.js";
import type {
  RunOutcome,
  RunReportingLevel,
} from "../workflows/run-outcome.js";

const logger = createLogger({ name: "routine-report" });

export interface ReportRoutineRunInput {
  /** The artifact the run produced, already resolved to its title — the
   * report names it instead of leaving a bare uuid in the chat. */
  artifact?: { id: string; title: string } | null;
  /**
   * The run is parked until its owner has looked (`report: ask`). The report
   * says so, and the inbox row is the review decision itself rather than an
   * `update` about the post.
   */
  awaitingReview?: boolean;
  /** The flow's own verdict on the work, when it declared one. */
  outcome?: RunOutcome;
  /** Why it failed, when it did — the run's own words. */
  reason?: string | null;
  /** The run's reporting level; overrides the routine's knob when present. */
  reporting?: RunReportingLevel;
  /**
   * Who the routine's agent reports to in its Space (the agent mount's
   * `reports_to`), or null. Defaults to a core lookup as the AI service.
   */
  resolveReportsTo?: (input: {
    agentId: string;
    spaceId: string;
    tenantId: string;
  }) => Promise<string | null>;
  routineId: string;
  routines: RoutineStore;
  runId: string;
  /**
   * When this fire started. The report body is the run's LAST word, and once
   * fires share one standing thread the previous fire's answer sits right
   * above it — reporting that back as new would be worse than silence.
   */
  since?: Date;
  status: "completed" | "failed";
  store?: ThreadStore | null;
  /**
   * The settle's one-line summary of the result. Preferred over the run's
   * last words at `info` level — an output-schema run's last words are a
   * JSON object, and a JSON blob pasted into a chat is not a report.
   */
  summary?: string | null;
  tenantId: string;
  /** The fire's own thread — where the result was actually written. */
  threadId: string;
}

/** The assistant's last word in the fire's thread — the report's body. */
function lastAssistantText(
  messages: readonly { parts: unknown; role: string }[]
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts
      .filter(
        (part): part is { text: string; type: string } =>
          typeof part === "object" &&
          part !== null &&
          (part as { type?: unknown }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string"
      )
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }
  return null;
}

/** Every assistant message of the run in order — the verbose report's body. */
function allAssistantTexts(
  messages: readonly { parts: unknown; role: string }[]
): string | null {
  const texts: string[] = [];
  for (const message of messages) {
    if (message?.role !== "assistant") {
      continue;
    }
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts
      .filter(
        (part): part is { text: string; type: string } =>
          typeof part === "object" &&
          part !== null &&
          (part as { type?: unknown }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string"
      )
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) {
      texts.push(text);
    }
  }
  return texts.length > 0 ? texts.join("\n\n---\n\n") : null;
}

/**
 * The run's last word, made postable. An output-schema run answers in JSON —
 * a chat report takes its `summary`-like prose field, and when the object
 * carries none the report falls back to its no-written-result line instead
 * of pasting the blob.
 */
function proseFromLastWord(lastWord: string | null): string | null {
  if (!lastWord) {
    return null;
  }
  if (!lastWord.startsWith("{")) {
    return lastWord;
  }
  try {
    const parsed = JSON.parse(lastWord) as Record<string, unknown>;
    for (const key of ["summary", "result", "text", "message"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  } catch {
    return lastWord;
  }
}

/**
 * The report's text. Named so a reader of the chat knows a machine put it
 * there — an unexplained table appearing in a conversation is worse than no
 * report at all.
 */
const OUTCOME_LABELS: Partial<Record<RunOutcome, string>> = {
  failed: "the work failed",
  needs_attention: "needs your look",
  nothing_to_do: "nothing to do",
  partial: "partly done",
  rejected: "rejected",
};

export function buildRoutineReportText(input: {
  artifact?: { id: string; title: string } | null;
  awaitingReview?: boolean;
  body: string | null;
  name: string;
  outcome?: RunOutcome;
  reason?: string | null;
  status: "completed" | "failed";
}): string {
  const label = input.outcome ? OUTCOME_LABELS[input.outcome] : undefined;
  const heading = `**Routine · ${input.name}**${label ? ` — ${label}` : ""}`;
  if (input.status === "failed") {
    const reason = input.reason?.trim();
    return `${heading}\n\nRun failed${reason ? `: ${reason}` : "."}`;
  }
  const artifactLine = input.artifact
    ? `\n\n📄 Artifact: **${input.artifact.title}**`
    : "";
  const body = input.body?.trim();
  // A completed run whose WORK went wrong explains itself through the reason:
  // outcome and status are different planes, and "rejected" with no why is a
  // report that only raises questions.
  const reason = input.reason?.trim();
  const explained =
    reason &&
    (input.outcome === "failed" ||
      input.outcome === "rejected" ||
      input.outcome === "needs_attention")
      ? `\n\n${reason}`
      : "";
  // The hold is part of the report: a reader must know the routine is
  // waiting on THEM, not just done.
  const reviewLine = input.awaitingReview
    ? "\n\n⏸ Waiting for your review — this routine holds until you mark the run reviewed."
    : "";
  // A run that succeeded without saying anything still gets reported. Silence
  // that looks like success is the shape of failure this cutover kept hitting.
  return body
    ? `${heading}\n\n${body}${explained}${artifactLine}${reviewLine}`
    : `${heading}\n\n${reason ?? "Run finished without a written result."}${artifactLine}${reviewLine}`;
}

/**
 * How loudly this run lands in the owner's chat.
 *
 * The run's own level wins when present — a per-run widening (or quieting) of
 * the routine's knob. Without one, `nothing_to_do` is silent by design (the
 * quiet nightly report is a consequence of the outcome, not a choice), and the
 * knob maps `quiet`→silent, everything else→info. Three overrides beat all of
 * it: a crashed run always reports, so does work that went wrong —
 * `failed`, `rejected`, `needs_attention` — because silence that hides a
 * problem is the exact bug reporting exists to end, and so does an `ask`
 * routine, whose every run waits for a person and cannot wait in silence.
 */
export function resolveReportingLevel(input: {
  outcome?: RunOutcome;
  reporting?: RunReportingLevel;
  routineReport: RoutineRow["report"];
  status: "completed" | "failed";
}): RunReportingLevel {
  const mustReport =
    input.status === "failed" ||
    input.routineReport === "ask" ||
    input.outcome === "failed" ||
    input.outcome === "rejected" ||
    input.outcome === "needs_attention";
  const chosen =
    input.reporting ??
    (input.outcome === "nothing_to_do"
      ? "silent"
      : input.routineReport === "quiet"
        ? "silent"
        : "info");
  return mustReport && chosen === "silent" ? "info" : chosen;
}

/**
 * Where a routine speaks: the specialist's shared conversation in the
 * routine's Space — the same thread `resolveAgentDeskDefault` opens for
 * everyone, so the message is waiting where people land rather than in a
 * thread of the routine's creator that nobody else opens.
 * Shared by the settle report and the in-run tools (`routine_report`,
 * `routine_ask`); a second copy of this resolution would drift on the next
 * thread-shape change.
 */
export async function resolveRoutineOwnerThread(input: {
  routine: RoutineRow;
  store: ThreadStore;
}): Promise<string | null> {
  const { routine, store } = input;
  return await resolveSpecialistChatThread({
    agentId: routine.agent_id,
    ownerUserId: routine.created_by_user_id,
    spaceId: routine.space_id,
    store,
    tenantId: routine.tenant_id,
    threadSeed: `routine-report-thread:${routine.id}`,
    title: routine.name,
  });
}

/**
 * The agent a routine's agent reports to in the routine's Space — read from
 * the agent's mount row as the AI service, since a settle has no person at the
 * keyboard. Null when the mount names nobody, or core cannot be reached: a
 * missing second reader must never block the owner's own report.
 */
export async function resolveReportsToFromCore(input: {
  agentId: string;
  spaceId: string;
  tenantId: string;
}): Promise<string | null> {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    return null;
  }
  const scope = await resolveTaskJobServiceScope(input.tenantId);
  const accessToken = scopeAccessToken(scope);
  if (!accessToken) {
    return null;
  }
  const core = new EngentyCoreClient({ accessToken, coreBaseUrl });
  const mounts = await core.listSpaceMounts(input.spaceId);
  const mount = mounts.find(
    (row) => row.resourceType === "agent" && row.resourceKey === input.agentId
  );
  const reportsTo = mount?.reportsTo?.trim();
  return reportsTo && reportsTo !== input.agentId ? reportsTo : null;
}

/**
 * Where the routine's agent reports upward: the shared conversation of the
 * agent it reports to, in the same Space. A second destination for the same report,
 * so a chief of staff sees what its teammates' routines did without anyone
 * forwarding it. Null when the agent reports to nobody.
 */
export async function resolveReportsToThread(input: {
  reportsTo: string;
  routine: RoutineRow;
  store: ThreadStore;
}): Promise<string | null> {
  return await resolveSpecialistChatThread({
    agentId: input.reportsTo,
    ownerUserId: input.routine.created_by_user_id,
    spaceId: input.routine.space_id,
    store: input.store,
    tenantId: input.routine.tenant_id,
    threadSeed: `routine-report-thread:${input.routine.id}:${input.reportsTo}`,
    title: input.routine.name,
  });
}

/**
 * Post a finished fire's outcome where its owner will see it. Best-effort by
 * design: the run already happened, and a reporting failure must not rewrite
 * its status — but it is logged loudly, because a silent miss here is
 * indistinguishable from the silence this exists to end.
 */
export async function reportRoutineRun(
  input: ReportRoutineRunInput
): Promise<void> {
  const store = input.store ?? createThreadStoreFromEnv();
  if (!store) {
    return;
  }
  try {
    const routine = await input.routines.get({
      id: input.routineId,
      tenantId: input.tenantId,
    });
    if (!routine) {
      return;
    }
    const level = resolveReportingLevel({
      routineReport: routine.report,
      status: input.status,
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.reporting ? { reporting: input.reporting } : {}),
    });
    if (level === "silent") {
      return;
    }
    const destination = await resolveRoutineOwnerThread({ routine, store });
    if (!destination) {
      logger.info("routine report skipped — no owner chat to speak into", {
        routineId: routine.id,
        runId: input.runId,
      });
      return;
    }
    const messages = await store.listMessagesOrdered({
      tenantId: input.tenantId,
      threadId: input.threadId,
      ...(input.since ? { after: input.since } : {}),
    });
    const lastWord = lastAssistantText(messages);
    // A contract run's last word is the JSON its schema demanded; the chat
    // gets the settle's summary instead — whenever one exists, verdict or
    // not — and a JSON last word without a summary yields its prose field
    // rather than being pasted raw. Verbose keeps the whole narrative.
    const text = buildRoutineReportText({
      body:
        level === "verbose"
          ? allAssistantTexts(messages) || lastWord
          : input.summary?.trim() || proseFromLastWord(lastWord),
      name: routine.name,
      status: input.status,
      ...(input.awaitingReview ? { awaitingReview: true } : {}),
      ...(input.artifact ? { artifact: input.artifact } : {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    });
    const metadata = {
      routine_id: routine.id,
      run_id: input.runId,
      run_thread_id: input.threadId,
      source: "routine-report",
    };
    // The desk door: same room `resolveRoutineOwnerThread` found, plus the
    // inbox `update` for the Space. The id derives from the run, so a
    // replayed settle upserts instead of posting the same report twice.
    await speakOnDesk({
      agentId: routine.agent_id,
      messageId: stableUuid(`routine-report:${input.runId}`),
      metadata,
      // A held run's inbox row is the review decision itself — an `update`
      // beside it would be the same news twice.
      notify: input.awaitingReview
        ? false
        : {
            summary: `Routine · ${routine.name}: ${input.status === "failed" ? "run failed" : input.summary?.trim() || "finished"}`,
          },
      ownerUserId: routine.created_by_user_id,
      source: "routine-report",
      spaceId: routine.space_id,
      store,
      tenantId: input.tenantId,
      text,
      threadSeed: `routine-report-thread:${routine.id}`,
      title: routine.name,
    });
    // Upward, too: the same words in the room of whoever this agent reports
    // to. Its own failure is logged, never raised — the owner already has
    // the report.
    if (routine.space_id) {
      try {
        const reportsTo = await (
          input.resolveReportsTo ?? resolveReportsToFromCore
        )({
          agentId: routine.agent_id,
          spaceId: routine.space_id,
          tenantId: input.tenantId,
        });
        const upward = reportsTo
          ? await resolveReportsToThread({ reportsTo, routine, store })
          : null;
        if (upward && upward !== destination && reportsTo) {
          await speakOnDesk({
            agentId: reportsTo,
            messageId: stableUuid(`routine-report:${input.runId}:${reportsTo}`),
            metadata: { ...metadata, reports_to: reportsTo },
            ownerUserId: routine.created_by_user_id,
            source: "routine-report",
            spaceId: routine.space_id,
            store,
            tenantId: input.tenantId,
            text: `${text}\n\n_Reported by ${routine.agent_id}._`,
            threadSeed: `routine-report-thread:${routine.id}:${reportsTo}`,
            title: routine.name,
          });
        }
      } catch (err) {
        logger.warn("routine report to reports_to failed", {
          error: err instanceof Error ? err.message : String(err),
          routineId: routine.id,
          runId: input.runId,
        });
      }
    }
  } catch (err) {
    logger.warn("routine report failed", {
      error: err instanceof Error ? err.message : String(err),
      routineId: input.routineId,
      runId: input.runId,
    });
  }
}
