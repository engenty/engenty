/**
 * `@` candidates for a Space desk composer: everything in the Space a message
 * can point at — its people, every agent on its roster (the desk's own agent
 * included, since in a room the host is one participant among the others), the
 * rooms it holds, its routines, and the artifacts it has produced.
 *
 * All five are references, never a lane switch — the desk belongs to one
 * agent, and a mentioned colleague, room or artifact rides the turn as an
 * `engenty_refs` item (`core:user:<id>` / `ai:agent:<id>` / `ai:room:<id>` /
 * `ai:routine:<id>` / `artifact:<id>`) the agent can act on.
 */
import {
  AgentFace,
  agentIdToMentionHandle,
  iconForArtifactType,
  type MentionRefCandidate,
  type MentionRefSearch,
  useContainerArtifactsQuery,
  useSpaceConversationsQuery,
} from "@engenty/ai-ui";
import { useRoutinesListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import type { EngentyKind } from "@engenty/ui-core";
import { CalendarClock, MessagesSquare } from "lucide-react";
import { type ComponentType, useCallback, useMemo } from "react";
import { request } from "./api/client";
import type { Space } from "./api/spaces-client";
import { useSpacePeople } from "./use-space-people";
import { useSpaceRosterAgents } from "./use-space-roster-agents";

export const AGENT_MENTION_ENTITY = "ai:agent";
const USER_MENTION_ENTITY = "core:user";
const ROOM_MENTION_ENTITY = "ai:room";
const ARTIFACT_MENTION_ENTITY = "artifact";
/** Same entity and ref the routine page's "edit in chat" puts in the draft. */
const ROUTINE_MENTION_ENTITY = "routine";

/** Rooms and artifacts both grow without bound; the picker shows the newest. */
const ROOM_LIMIT = 12;
const ARTIFACT_LIMIT = 12;
const ROUTINE_LIMIT = 12;

/**
 * The picker draws an agent as its own face — generated portrait when it
 * has one, otherwise the blob the sidebar uses. Cached per agent so a
 * keystroke does not remount every row.
 */
const agentIcons = new Map<string, ComponentType<{ className?: string }>>();

function agentMentionIcon(agent: {
  avatarUrl?: string | null;
  engenty: EngentyKind;
  id: string;
}): ComponentType<{ className?: string }> {
  const cacheKey = `${agent.id}:${agent.avatarUrl ?? ""}:${agent.engenty}`;
  const cached = agentIcons.get(cacheKey);
  if (cached) {
    return cached;
  }
  const Icon = ({ className }: { className?: string }) => (
    <AgentFace
      animated={false}
      avatarUrl={agent.avatarUrl}
      className={className ?? "[&_.e-shadow]:hidden"}
      kind={agent.engenty}
      name={agent.id}
      size={18}
    />
  );
  agentIcons.set(cacheKey, Icon);
  return Icon;
}

function matches(query: string, ...fields: Array<string | null | undefined>) {
  if (!query) {
    return true;
  }
  return fields.some((field) => field?.toLowerCase().includes(query));
}

export function useSpaceMentionRefSearch(
  space: Space | null | undefined
): MentionRefSearch {
  const { t } = useTranslation("common");
  const { agents } = useSpaceRosterAgents(space?.id ?? null);
  const people = useSpacePeople(space);
  const conversationsQuery = useSpaceConversationsQuery(space?.id ?? null);
  const container = useMemo(
    () => (space?.id ? ({ id: space.id, tier: "space" } as const) : null),
    [space?.id]
  );
  const artifactsQuery = useContainerArtifactsQuery(container);
  // The desk page is inside the Space, so "current" is this Space.
  const routinesQuery = useRoutinesListQuery();
  const agentsGroup = t("spaces.agents.mentions.agents");
  const peopleGroup = t("spaces.agents.mentions.people");
  const roomsGroup = t("spaces.agents.mentions.rooms", {
    defaultValue: "Rooms",
  });
  const recordsGroup = t("spaces.agents.mentions.records", {
    defaultValue: "Records",
  });
  const artifactsGroup = t("spaces.agents.mentions.artifacts", {
    defaultValue: "Artifacts",
  });
  const routinesGroup = t("spaces.agents.mentions.routines", {
    defaultValue: "Routines",
  });
  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents]
  );
  const rooms = conversationsQuery.data?.rooms;
  const artifacts = artifactsQuery.data;
  const routines = routinesQuery.data?.routines;

  return useCallback<MentionRefSearch>(
    async (rawQuery) => {
      const query = rawQuery.trim().toLowerCase();
      const agentRows = agents
        .map((agent) => ({ agent, handle: agentIdToMentionHandle(agent.id) }))
        .filter(({ agent, handle }) =>
          matches(query, agent.name, handle, agent.id)
        )
        .map(
          ({ agent, handle }): MentionRefCandidate => ({
            entity: AGENT_MENTION_ENTITY,
            group: agentsGroup,
            icon: agentMentionIcon(agent),
            label: agent.name,
            ref: `${AGENT_MENTION_ENTITY}:${agent.id}`,
            sublabel: `@${handle}`,
          })
        );
      const peopleRows = people
        .filter((person) => matches(query, person.name, person.email))
        .map(
          (person): MentionRefCandidate => ({
            entity: USER_MENTION_ENTITY,
            group: peopleGroup,
            label: person.name,
            ref: `${USER_MENTION_ENTITY}:${person.id}`,
            sublabel: person.email ?? undefined,
          })
        );
      // A room's name is the person's handle for it; its members say which
      // room it is when two carry similar names.
      const roomRows = (rooms ?? [])
        .map((room) => ({
          members: room.members
            .map((member) => agentNameById.get(member.agent_id))
            .filter((name): name is string => Boolean(name)),
          title: room.session.title?.trim() || null,
          id: room.session.id,
        }))
        .filter((room) => room.title !== null)
        .filter((room) => matches(query, room.title, ...room.members))
        .slice(0, ROOM_LIMIT)
        .map(
          (room): MentionRefCandidate => ({
            entity: ROOM_MENTION_ENTITY,
            group: roomsGroup,
            icon: MessagesSquare,
            label: room.title as string,
            ref: `${ROOM_MENTION_ENTITY}:${room.id}`,
            ...(room.members.length > 0
              ? { sublabel: room.members.join(", ") }
              : {}),
          })
        );
      // Its owner says whose routine it is when two carry similar names.
      const routineRows = (routines ?? [])
        .map((routine) => ({
          owner: agentNameById.get(routine.agent_id) ?? null,
          routine,
        }))
        .filter(({ owner, routine }) => matches(query, routine.name, owner))
        .slice(0, ROUTINE_LIMIT)
        .map(
          ({ owner, routine }): MentionRefCandidate => ({
            entity: ROUTINE_MENTION_ENTITY,
            group: routinesGroup,
            icon: CalendarClock,
            label: routine.name,
            ref: `ai:routine:${routine.id}`,
            ...(owner ? { sublabel: owner } : {}),
          })
        );
      const artifactRows = (artifacts ?? [])
        .filter((artifact) => matches(query, artifact.title, artifact.type))
        .slice(0, ARTIFACT_LIMIT)
        .map(
          (artifact): MentionRefCandidate => ({
            entity: ARTIFACT_MENTION_ENTITY,
            group: artifactsGroup,
            icon: iconForArtifactType(artifact.type),
            label: artifact.title,
            ref: `${ARTIFACT_MENTION_ENTITY}:${artifact.id}`,
            // The bare type word, the way Work rows and the artifact picker
            // label it — not translated anywhere yet.
            sublabel: artifact.type,
          })
        );
      const recordRows = query
        ? await searchRecords(rawQuery, recordsGroup)
        : [];
      return [
        ...agentRows,
        ...peopleRows,
        ...roomRows,
        ...routineRows,
        ...artifactRows,
        ...recordRows,
      ];
    },
    [
      agentNameById,
      agents,
      agentsGroup,
      artifacts,
      artifactsGroup,
      people,
      peopleGroup,
      recordsGroup,
      rooms,
      roomsGroup,
      routines,
      routinesGroup,
    ]
  );
}

const RECORD_LIMIT = 8;

interface WorkspaceSearchItem {
  doc_id: string;
  source_type: string;
  text?: string | null;
  title?: string | null;
}

/** A ranked hit wraps the indexed item; older shapes carried the item flat. */
type WorkspaceSearchMatch = WorkspaceSearchItem | { item: WorkspaceSearchItem };

function matchItem(match: WorkspaceSearchMatch): WorkspaceSearchItem {
  return "item" in match ? match.item : match;
}

/**
 * Module records (contacts, offers, …) through the unified workspace search —
 * the same lexical index every module search tool answers from, scoped by
 * the server to the spaces the caller may enter. A source type
 * "contacts.contact" is the entity "contacts:contact"; the match's doc id is
 * the record id, so the ref is the canonical ObjectRef.
 */
async function searchRecords(
  query: string,
  group: string
): Promise<MentionRefCandidate[]> {
  try {
    const response = await request<{
      data?: { matches?: WorkspaceSearchMatch[] };
      matches?: WorkspaceSearchMatch[];
    }>("/api/workspace-search", {
      body: { limit: RECORD_LIMIT, query: query.trim() },
      method: "POST",
    });
    const matches = response.data?.matches ?? response.matches ?? [];
    return matches
      .map(matchItem)
      .filter((item) => item.doc_id && item.source_type.includes("."))
      .map((item): MentionRefCandidate => {
        const entity = item.source_type.replace(".", ":");
        return {
          entity,
          group,
          label: item.title?.trim() || item.doc_id,
          ref: `${entity}:${item.doc_id}`,
          ...(item.text?.trim()
            ? { sublabel: item.text.trim().slice(0, 80) }
            : {}),
        };
      });
  } catch {
    return [];
  }
}
