import { AgentRoom, agentRoomHostKey } from "@engenty/ai-ui";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { SpaceComposerControls } from "@/components/spaces/SpaceComposerControls";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceMentionRefSearch } from "@/lib/use-space-mention-ref-search";
import { useSpacePeople } from "@/lib/use-space-people";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

/** `/s/<key>/rooms/<threadId>` — one room of the space, as its own page. */
export function SpaceRoomPage({
  canManageAgents,
}: {
  canManageAgents: boolean;
}) {
  const { spaceKey = "", threadId = "" } = useParams<{
    spaceKey: string;
    threadId: string;
  }>();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((candidate) => candidate.key === spaceKey),
    [spaceKey, spacesQuery.data]
  );
  const mentionRefSearch = useSpaceMentionRefSearch(space);
  const { agents: rosterAgents } = useSpaceRosterAgents(space?.id ?? null);
  // The space's people, the same rows the People section and the composer's `@`
  // list read. Feeds the room info's "add someone" picker.
  const spacePeople = useSpacePeople(space);

  if (!(space?.id && threadId)) {
    return null;
  }

  return (
    <AgentRoom
      canManage={canManageAgents}
      composerLeadingControl={
        <SpaceComposerControls
          hostKey={agentRoomHostKey(space.id, threadId)}
          space={space}
        />
      }
      mentionRefSearch={mentionRefSearch}
      rosterAgents={rosterAgents}
      spaceId={space.id}
      spaceKey={spaceKey}
      spacePeople={spacePeople}
      threadId={threadId}
    />
  );
}
