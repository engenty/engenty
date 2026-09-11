import { AgentDesk, agentDeskHostKey } from "@engenty/ai-ui";
import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { SpaceComposerControls } from "@/components/spaces/SpaceComposerControls";
import { resolveSpaceAgentDeskRedirect } from "@/lib/space-agent-nav";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceMentionRefSearch } from "@/lib/use-space-mention-ref-search";
import { useSpaceModules } from "@/lib/use-space-modules";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

export function SpaceAgentDeskPage({
  canManageAgents,
}: {
  canManageAgents: boolean;
}) {
  const { agentId = "", spaceKey = "" } = useParams<{
    agentId: string;
    spaceKey: string;
  }>();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((candidate) => candidate.key === spaceKey),
    [spaceKey, spacesQuery.data]
  );
  const mentionRefSearch = useSpaceMentionRefSearch(space);
  const { agents: rosterAgents } = useSpaceRosterAgents(space?.id ?? null);
  const { modules } = useSpaceModules(space?.id ?? null);
  const rosterEntry = useMemo(
    () => rosterAgents.find((candidate) => candidate.id === agentId),
    [agentId, rosterAgents]
  );
  // The module pill after the agent's name reads the way the sidebar does.
  const moduleLabel = useMemo(() => {
    const moduleId = rosterEntry?.managedByModule;
    return moduleId
      ? modules.find((app) => app.id === moduleId)?.label
      : undefined;
  }, [modules, rosterEntry]);
  const redirect = resolveSpaceAgentDeskRedirect(agentId, spaceKey);

  if (redirect) {
    return <Navigate replace to={redirect} />;
  }
  if (!space?.id) {
    return null;
  }

  return (
    <AgentDesk
      agentId={agentId}
      canManageAgents={canManageAgents}
      composerLeadingControl={
        <SpaceComposerControls
          hostKey={agentDeskHostKey(space.id, agentId)}
          space={space}
        />
      }
      mentionRefSearch={mentionRefSearch}
      moduleLabel={moduleLabel}
      reportsToName={rosterEntry?.reportsToName ?? undefined}
      rosterAgents={rosterAgents}
      spaceId={space.id}
      spaceKey={spaceKey}
    />
  );
}
