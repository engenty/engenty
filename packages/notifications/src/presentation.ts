// What a row says and where it leads, fixed at emit time.
//
// A row is read like a macOS banner: where it came from (space · actor), one
// short title, at most one plain line of body, and a click that lands on the
// thing itself. The title is a key plus names — never ids, never agent prose —
// so the UI can say it in the viewer's language
// (`notifications.titles.<key>` in apps/ui/src/locales). The English
// templates below are the server's own rendering: the stored `summary`, push
// and mail. The target is the in-app route of the subject, built here from
// the ids the producer already stamps, with the record's OWN space.
//
// Isomorphic and import-free (types only).
import type { NotificationRecord } from "./contracts.js";

/** Names a title may use. Missing names fall back to the producer's summary. */
export type NotificationTitleParams = Record<string, string | number>;

export interface NotificationTitle {
  /** A key of NOTIFICATION_TITLES; an unknown key falls back to the summary. */
  key: NotificationTitleKey | (string & {});
  params?: NotificationTitleParams;
}

/**
 * English titles. `{actor}` and `{space}` are filled from the origin labels
 * when the producer does not pass them. Keep each under ~60 characters once
 * filled; names are the only variable part.
 */
export const NOTIFICATION_TITLES = {
  action_failed: 'Workflow "{name}" failed',
  action_gate: 'Workflow "{name}" is waiting for your decision',
  action_question: 'Workflow "{name}" has a question',
  agent_desk_post: "{actor} posted an update",
  agent_handoff: "{from} handed work to {to}",
  agent_hired: "{name} joined the team",
  agent_look_proposed: "{actor} proposed a new look",
  agent_proposed: 'New agent "{name}" to review',
  agent_question: "{actor} has a question",
  agent_reply: "{from} replied to {to}",
  agent_revision_proposed: 'Changes to "{name}" to review',
  agent_run_suspended: "{actor} proposed changes to review",
  app_release_proposed: '"{name}" v{version} is ready to publish',
  approval_requested: "{actor} wants to run {operation}",
  records_written: "{actor} ran {operation}",
  room_paused: '"{name}" paused after {count} turns',
  routine_created: '{actor} created the routine "{name}"',
  routine_failed: 'Routine "{name}" failed',
  routine_outcome: 'Update from "{name}"',
  routine_review: 'Routine "{name}" finished — review the result',
  skill_proposed: 'New skill "{name}" to review',
  connector_import_requested: 'Import "{name}" as a connector?',
  stream_escalation: "{actor} needs your attention",
  stream_update: "Update from {actor}",
  task_completed: '"{task}" is done',
  task_failed: '"{task}" failed',
  task_needs_input: '"{task}" needs your input',
  task_question: '"{task}" has a question',
  task_review_requested: '"{task}" is ready for review',
  team_chat_dm: "{actor} sent you a message",
  team_chat_mention: "{actor} mentioned you in {name}",
  team_chat_message: "{actor} wrote in {name}",
  team_chat_reply: "{actor} replied in {name}",
  tool_approval: "{actor} wants to use {operation}",
  workflow_proposed: 'Workflow "{name}" to review',
  workflow_revised: 'Workflow "{name}" v{version} to review',
} as const;

export type NotificationTitleKey = keyof typeof NOTIFICATION_TITLES;

export const TITLE_MAX = 120;
export const BODY_MAX = 140;

/**
 * Fill a template. Null when a name it needs is missing — the caller falls
 * back to something it can say whole rather than a title with a hole.
 */
export function fillTitleTemplate(
  template: string,
  params: NotificationTitleParams
): string | null {
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing = true;
      return "";
    }
    return String(value).trim();
  });
  return missing ? null : clip(text, TITLE_MAX);
}

/** English title for a key; null for an unknown key or a missing name. */
export function renderNotificationTitle(
  key: string,
  params: NotificationTitleParams
): string | null {
  const template = (NOTIFICATION_TITLES as Record<string, string>)[key];
  return template ? fillTitleTemplate(template, params) : null;
}

/** One line, whitespace collapsed, cut at a word with an ellipsis. */
export function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= max) {
    return line;
  }
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The body: the first non-empty line of what the producer had to say, cut to
 * one short line. Markdown emphasis and headings are dropped — the list is
 * plain text.
 */
export function notificationBody(
  text: string | null | undefined
): string | null {
  if (!text) {
    return null;
  }
  const first = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/[*_`]+/g, "")
        .trim()
    )
    .find((line) => line.length > 0);
  return first ? clip(first, BODY_MAX) : null;
}

/**
 * Where a record came from, as one line: "Space · Actor". The first line of a
 * banner, the context line of a row.
 */
export function notificationSource(
  record: Pick<NotificationRecord, "metadata">
): string | null {
  const meta = record.metadata ?? {};
  const parts = [str(meta.space_name), str(meta.actor_label)].filter(
    (part): part is string => part !== null
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

type TargetInput = Pick<
  NotificationRecord,
  | "actor_id"
  | "actor_kind"
  | "kind"
  | "metadata"
  | "subject_id"
  | "subject_type"
>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

const enc = encodeURIComponent;

/**
 * The in-app route of a record's subject — where the thing is decided or
 * read. Built from the record's own space (`metadata.space_key`), never the
 * page the viewer happens to be on. Null when the record names nothing a
 * person can open.
 */
export function notificationTarget(record: TargetInput): string | null {
  const meta = record.metadata ?? {};
  const space = str(meta.space_key);
  const inSpace = (rest: string) => (space ? `/s/${enc(space)}/${rest}` : null);

  const taskId =
    record.subject_type === "task" ? record.subject_id : str(meta.task_id);
  if (taskId) {
    return inSpace(`tasks/${enc(taskId)}`) ?? `/mdl/tasks/${enc(taskId)}`;
  }

  // A result a run stored: the notification opens the result, not the chat
  // it was made in. Review rows below still go to the decision.
  const artifactId = str(meta.artifact_id);
  if (artifactId && record.kind !== "routine_review") {
    const artifact = inSpace(
      `data?${new URLSearchParams({ artifact: artifactId }).toString()}`
    );
    if (artifact) {
      return artifact;
    }
  }

  // A routine held for review is released from its Engenty's desk (the run
  // activity in the chat it posted to), not from the run page.
  if (record.kind === "routine_review") {
    const agent =
      str(meta.thread_agent_id) ??
      str(meta.agent_id) ??
      (record.actor_kind === "agent" ? str(record.actor_id) : null);
    const thread = str(meta.thread_id);
    if (agent) {
      const desk = inSpace(
        thread
          ? `agents/${enc(agent)}?engagement=${enc(`conversation:${thread}`)}`
          : `agents/${enc(agent)}`
      );
      if (desk) {
        return desk;
      }
    }
  }

  const runId =
    record.subject_type === "workflow_run"
      ? record.subject_id
      : str(meta.run_id);
  // A run an Engenty works in its own chat (a routine's fire): that chat,
  // with the run open in the pane beside it — the gate is answered there.
  // Only a wizard has a page of its own.
  const runThreadId = str(meta.thread_id);
  const runAgentId = str(meta.thread_agent_id);
  if (
    runId &&
    runThreadId &&
    runAgentId &&
    str(meta.workflow_surface) !== "wizard"
  ) {
    const search = new URLSearchParams({
      engagement: `conversation:${runThreadId}`,
      panel: "runs",
      run: runId,
    });
    const desk = inSpace(`agents/${enc(runAgentId)}?${search.toString()}`);
    if (desk) {
      return desk;
    }
  }

  // A parked or failed wizard run: its run page, where the gate is answered.
  const workflowId = str(meta.workflow_id);
  if (runId && workflowId) {
    const page = inSpace(`workflows/${enc(workflowId)}/runs/${enc(runId)}`);
    if (page) {
      return page;
    }
  }

  // A room (many agents, many people).
  const roomThreadId = str(meta.room_thread_id);
  if (roomThreadId) {
    return inSpace(`rooms/${enc(roomThreadId)}`);
  }

  // A conversation on an Engenty's desk: the chat where the card sits.
  const threadId = str(meta.thread_id);
  const deskAgentId =
    str(meta.thread_agent_id) ??
    (record.actor_kind === "agent" ? str(record.actor_id) : null);
  if (threadId && deskAgentId) {
    const desk = inSpace(
      `agents/${enc(deskAgentId)}?engagement=${enc(`conversation:${threadId}`)}`
    );
    if (desk) {
      return desk;
    }
  }

  // A workflow waiting for publish, or a new routine: the owning Engenty's
  // manage panel, opened on that item.
  if (workflowId) {
    const owner = str(meta.owner_agent_id) ?? str(meta.agent_id);
    const routineId = str(meta.routine_id);
    if (owner) {
      const item = routineId
        ? `&routine=${enc(routineId)}`
        : `&workflow=${enc(workflowId)}`;
      const panel = inSpace(`agents/${enc(owner)}?panel=manage${item}`);
      if (panel) {
        return panel;
      }
    }
  }

  const agentId =
    str(meta.agent_id) ??
    (record.actor_kind === "agent" ? str(record.actor_id) : null);
  switch (record.kind) {
    case "agent_proposed":
      return inSpace("agents");
    case "skill_proposed":
    case "agent_hired":
    case "routine_failed":
    case "routine_outcome":
    case "routine_created":
      return agentId ? inSpace(`agents/${enc(agentId)}`) : inSpace("agents");
    default:
      return null;
  }
}
