/**
 * Space-native hire: `/s/:spaceKey/agents/new`.
 *
 * Reuses the admin agent form with this space locked — no picker, and save
 * mounts here then opens the desk. Who can hire is who can already open the
 * agent mount picker (tenant admin, or the owner of a personal space).
 */
import { AgentFormPage } from "@engenty/ai-ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

export function SpaceAgentHirePage() {
  const { spaceKey = "" } = useParams<{ spaceKey: string }>();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((candidate) => candidate.key === spaceKey),
    [spaceKey, spacesQuery.data]
  );
  const canManage = Boolean(isTenantAdmin || isSuperAdmin);
  const canHire = canManage || Boolean(space?.ownerUserId);

  if (spacesQuery.isPending) {
    return null;
  }
  if (!space) {
    return <Navigate replace to={spaceRootPath(spaceKey)} />;
  }
  if (!canHire) {
    return <Navigate replace to={spaceRootPath(spaceKey)} />;
  }

  return (
    <AgentFormPage
      lockedSpace={{ id: space.id, key: space.key, name: space.name }}
    />
  );
}
