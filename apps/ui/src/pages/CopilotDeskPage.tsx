// The copilot's page — `/copilot`, and `/s/<key>/copilot` inside a space. The
// desk itself is `CopilotDesk` in ai-ui; this page hands it what only the
// app's queries know: the space the URL names, its audience, the `@`
// references, and the composer controls the copilot module ships.
import { CopilotDesk } from "@engenty/ai-ui";
import { CopilotEffortControl } from "@engenty/engenty-copilot/ui/effort-control";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { SpaceComposerControls } from "@/components/spaces/SpaceComposerControls";
import { useSpaceAudience } from "@/lib/space-audience";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceMentionRefSearch } from "@/lib/use-space-mention-ref-search";

export function CopilotDeskPage() {
  const { spaceKey } = useParams<{ spaceKey?: string }>();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () =>
      spaceKey
        ? spacesQuery.data?.find((candidate) => candidate.key === spaceKey)
        : undefined,
    [spaceKey, spacesQuery.data]
  );
  const mentionRefSearch = useSpaceMentionRefSearch(space);
  const spaceAudience = useSpaceAudience(space);
  // Inside a space the copilot reaches the space's tools, so its composer
  // carries the space's approval mode beside the effort chooser; outside,
  // effort alone.
  const composerLeadingControl = space ? (
    <SpaceComposerControls space={space} />
  ) : (
    <CopilotEffortControl />
  );
  return (
    <CopilotDesk
      composerLeadingControl={composerLeadingControl}
      mentionRefSearch={mentionRefSearch}
      space={space ? { id: space.id, key: space.key, name: space.name } : null}
      spaceAudience={spaceAudience}
    />
  );
}
