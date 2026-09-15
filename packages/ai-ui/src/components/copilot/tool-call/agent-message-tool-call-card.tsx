"use client";

// A `message_agent` hand-off, drawn the way a person reads it: one line that
// says who was messaged, not an inspector of the call. The colleague's answer
// is in the colleague's thread (and, for `ask`, relayed in the sender's own
// reply), so the row is a link to that thread — the desk when the Space is
// known, the sub-run monitor otherwise. A room post (`agent_ids`) names every
// member and links the room on its host's desk.
//
// While an `ask` is in flight the row carries the colleague's newest progress
// line, because that stretch is most of the wall-clock time and a bare
// "Thinking …" says nothing about it: watching two agents work through a
// Space table, a person saw only the shimmer for minutes (live 2026-09-07).
// Newest line only — the full log stays in the colleague's own thread.

import {
  conversationEngagement,
  resolveAgentEngenty,
  spaceRoomPathname,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { CircleAlert, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAgentDisplayNamesVersion } from "../../../ag-ui/agent-display-names.js";
import { resolveAgentDisplayName } from "../../../ag-ui/resolve-transcript-tool-display.js";
import {
  DelegatedArtifactRow,
  readDelegatedArtifactIds,
} from "../../../artifacts/delegated-artifact-row.js";
import { spaceAgentDeskPath } from "../../../features/agent-form/hire-spaces.js";
import { AgentNamePill } from "../agent-name-pill.js";
import type { ToolCallCardProps } from "./tool-call-card.types";

interface MessageAgentOutput {
  agent?: unknown;
  agent_engenty?: unknown;
  agent_id?: unknown;
  child_thread_id?: unknown;
  members?: unknown;
  message?: unknown;
  ok?: unknown;
  opened?: unknown;
  room_host_agent_id?: unknown;
}

interface RoomMember {
  agent_id: string;
  engenty: string | null;
  name: string;
}

function readMembers(value: unknown): RoomMember[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const members = value.flatMap((entry) => {
    const record = readRecord(entry);
    const agentId = readString(record?.agent_id);
    return agentId
      ? [
          {
            agent_id: agentId,
            engenty: readString(record?.engenty),
            name: readString(record?.name) ?? agentId,
          },
        ]
      : [];
  });
  return members.length > 0 ? members : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function AgentMessageToolCallCard({
  className,
  errorText,
  fullPageHref,
  input,
  output,
  progressLines,
  state,
}: ToolCallCardProps) {
  const { t } = useTranslation("ai-ui");
  const { currentSpace } = useWorkspaceContext();
  // Re-render when the agent catalog lands, so a row drawn before it stops
  // showing the id.
  useAgentDisplayNamesVersion();
  const out = (readRecord(output) ?? {}) as MessageAgentOutput;
  const agentId =
    readString(out.agent_id) ?? readString(readRecord(input)?.agent_id) ?? "";
  // `message_agent` writes the colleague's name into the output, but falls
  // back to the bare id when the registry could not resolve the agent at run
  // time. A name loaded since then beats that stored id.
  const storedName = readString(out.agent);
  const name =
    storedName && storedName !== agentId
      ? storedName
      : agentId
        ? resolveAgentDisplayName(agentId)
        : (storedName ?? "");
  const kind = resolveAgentEngenty(agentId, readString(out.agent_engenty));
  const childThreadId = readString(out.child_thread_id);
  const members = readMembers(out.members);
  // A room lives on its host's desk, which for an opened room is the sender.
  const deskAgentId = readString(out.room_host_agent_id) ?? agentId;
  const failed =
    state === "error" || Boolean(errorText?.trim()) || out.ok === false;
  const running =
    !failed &&
    output === undefined &&
    (state === "running" || state === "pending");
  const failureText = errorText?.trim() || readString(out.message) || undefined;
  const liveLine = running ? (readString(progressLines?.at(-1)) ?? null) : null;
  // What the colleague made while answering. Its own Write card is in the
  // pair thread; the person is here, so the deliverable is offered here.
  const artifactIds = failed ? [] : readDelegatedArtifactIds(output);

  // A room is its own page; a pair thread lives on the colleague's desk.
  const href =
    currentSpace?.key && childThreadId
      ? members
        ? spaceRoomPathname(currentSpace.key, childThreadId)
        : deskAgentId
          ? `${spaceAgentDeskPath(currentSpace.key, deskAgentId)}?engagement=${encodeURIComponent(conversationEngagement(childThreadId))}`
          : (fullPageHref ?? null)
      : (fullPageHref ?? null);

  const label = running
    ? t("agentMessage.messaging")
    : failed
      ? t("agentMessage.failed")
      : members
        ? out.opened === true
          ? t("agentMessage.openedRoom")
          : t("agentMessage.postedInRoom")
        : t("agentMessage.messaged");

  const body = (
    <>
      {running ? (
        <Loader2 aria-hidden className="size-3 animate-spin" />
      ) : failed ? (
        <CircleAlert aria-hidden className="size-3 text-destructive" />
      ) : null}
      <span>{label}</span>
      {members ? (
        members.map((member) => (
          <AgentNamePill
            key={member.agent_id}
            kind={resolveAgentEngenty(member.agent_id, member.engenty)}
            name={member.name}
          />
        ))
      ) : (
        <AgentNamePill kind={kind} name={name} />
      )}
    </>
  );
  const rowClassName =
    "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs";

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center",
        className,
        "my-4 max-w-none"
      )}
      data-testid="agent-message-row"
      title={failureText}
    >
      {href && !running ? (
        <Link className={cn(rowClassName, "hover:bg-muted/60")} to={href}>
          {body}
        </Link>
      ) : (
        <span className={rowClassName}>{body}</span>
      )}
      {liveLine ? (
        <span
          className="max-w-full truncate px-1.5 text-muted-foreground/80 text-xs"
          data-testid="agent-message-progress"
        >
          {liveLine}
        </span>
      ) : null}
      {artifactIds.length > 0 ? (
        <div className="mt-2 flex w-full max-w-md flex-col gap-1.5">
          {artifactIds.map((artifactId) => (
            <DelegatedArtifactRow artifactId={artifactId} key={artifactId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
