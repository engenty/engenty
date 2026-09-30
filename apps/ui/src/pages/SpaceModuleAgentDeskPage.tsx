import {
  isSpaceReservedSegment,
  spaceModuleIdFromUrlSegment,
} from "@engenty/ai-core/browser";
import {
  type UiModuleSidebar,
  useUiContributions,
} from "@engenty/ui-plugin-sdk";
import { Navigate, useParams } from "react-router-dom";
import { SpaceModuleGate } from "@/components/spaces/SpaceModuleGate";
import { spaceAgentDeskPath } from "@/lib/space-routes";
import { SpaceAgentDeskPage } from "@/pages/SpaceAgentDeskPage";

/**
 * An agent's desk opened inside a module (`/s/<key>/<module>/agents/<id>`):
 * the same desk, with the module's registered sidebar beside it instead of the
 * Space's column. A module that registered no sidebar has nothing to keep, so
 * its desk opens at the Space's own address.
 */
export function SpaceModuleAgentDeskPage({
  canManageAgents,
}: {
  canManageAgents: boolean;
}) {
  const {
    agentId = "",
    moduleSegment = "",
    spaceKey = "",
  } = useParams<{
    agentId: string;
    moduleSegment: string;
    spaceKey: string;
  }>();
  const { contributions, ready } = useUiContributions();
  const moduleId = spaceModuleIdFromUrlSegment(moduleSegment);
  const registered = contributions.moduleSidebars?.find(
    (candidate) => candidate.moduleId === moduleId
  );

  if (!ready) {
    return null;
  }
  if (isSpaceReservedSegment(moduleSegment) || !registered) {
    return <Navigate replace to={spaceAgentDeskPath(spaceKey, agentId)} />;
  }
  return (
    <SpaceModuleGate moduleId={moduleId}>
      <ModuleSidebarDesk
        canManageAgents={canManageAgents}
        // A new module is a different hook: remount rather than call another
        // module's hooks in this one's slots.
        key={moduleId}
        useSidebar={registered.useSidebar}
      />
    </SpaceModuleGate>
  );
}

function ModuleSidebarDesk({
  canManageAgents,
  useSidebar,
}: {
  canManageAgents: boolean;
  useSidebar: () => UiModuleSidebar;
}) {
  const sidebar = useSidebar();
  return (
    <SpaceAgentDeskPage canManageAgents={canManageAgents} sidebar={sidebar} />
  );
}
