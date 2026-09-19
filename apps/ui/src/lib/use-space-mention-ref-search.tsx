/**
 * `@` candidates for a Space desk composer: everything in the Space a message
 * can point at — its people, every agent on its roster (the desk's own agent
 * included, since in a room the host is one participant among the others), the
 * rooms it holds, and the artifacts it has produced.
 *
 * All four are references, never a lane switch — the desk belongs to one
 * agent, and a mentioned colleague, room or artifact rides the turn as an
 * `engenty_refs` item (`core:user:<id>` / `ai:agent:<id>` / `ai:room:<id>` /
 * `artifact:<id>`) the agent can act on.
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
import { useTranslation } from "@engenty/i18n/ui";
import type { EngentyKind } from "@engenty/ui-core";
import { MessagesSquare } from "lucide-react";
import { type ComponentType, useCallback, useMemo } from "react";
import type { Space } from "./api/spaces-client";
import { useSpacePeople } from "./use-space-people";
import { useSpaceRosterAgents } from "./use-space-roster-agents";

export const AGENT_MENTION_ENTITY = "ai:agent";
const USER_MENTION_ENTITY = "core:user";
const ROOM_MENTION_ENTITY = "ai:room";
const ARTIFACT_MENTION_ENTITY = "artifact";

/** Rooms and artifacts both grow without bound; the picker shows the newest. */
const ROOM_LIMIT = 12;
const ARTIFACT_LIMIT = 12;

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
  const agentsGroup = t("spaces.agents.mentions.agents");
  const peopleGroup = t("spaces.agents.mentions.people");
  const roomsGroup = t("spaces.agents.mentions.rooms", {
    defaultValue: "Rooms",
  });
  const artifactsGroup = t("spaces.agents.mentions.artifacts", {
    defaultValue: "Artifacts",
  });
  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents]
  );
  const rooms = conversationsQuery.data?.rooms;
  const artifacts = artifactsQuery.data;

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
      return [...agentRows, ...peopleRows, ...roomRows, ...artifactRows];
    },
    [
      agentNameById,
      agents,
      agentsGroup,
      artifacts,
      artifactsGroup,
      people,
      peopleGroup,
      rooms,
      roomsGroup,
    ]
  );
}
