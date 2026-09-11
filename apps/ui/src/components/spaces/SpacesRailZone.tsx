/**
 * Zone ② of the rail, bound to real data (PLAN-spaces.md Phase 5a ②).
 *
 * app-shell renders the tiles and owns the interaction; this component owns the
 * fetching, the recency doc and the create dialog, so the shell package stays
 * free of data access. The split follows the rest of the shell's props.
 */
import { resolveRailSpaces, SidebarSpacesZone } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SpaceSetupDialog } from "@/components/spaces/SpaceSetupDialog";
import { isPersonalSpace } from "@/lib/api/spaces-client";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpacesRecent } from "@/lib/spaces-recent-persistence";

export function SpacesRailZone() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const spacesQuery = useSpacesQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const spaces = useMemo(() => spacesQuery.data ?? [], [spacesQuery.data]);
  const { recent, visit } = useSpacesRecent({ enabled: true });

  // Which space the user is in, read from the URL rather than tracked in
  // state: navigation is the source of truth, and a second copy would drift on
  // back/forward.
  const currentSpaceKey = useMemo(() => {
    const match = location.pathname.match(/^\/s\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [location.pathname]);

  const currentSpaceId = useMemo(
    () =>
      currentSpaceKey
        ? (spaces.find((space) => space.key === currentSpaceKey)?.id ?? null)
        : null,
    [currentSpaceKey, spaces]
  );

  const resolved = useMemo(
    () =>
      resolveRailSpaces({
        currentSpaceId,
        recent,
        spaces: spaces.map((space) => ({
          color: space.color,
          icon: space.icon,
          id: space.id,
          // The list is already membership-filtered by `/api/spaces`, so any
          // owned space in it is the viewer's own — no identity check needed
          // here, and none wanted: the UI must not be a second place where
          // "who may see this" is decided.
          isPersonal: isPersonalSpace(space),
          key: space.key,
          name: space.name,
        })),
      }),
    [currentSpaceId, recent, spaces]
  );

  useEffect(() => {
    if (resolved.currentPromoted) {
      visit(currentSpaceId);
    }
  }, [currentSpaceId, resolved.currentPromoted, visit]);

  const canManage = Boolean(isTenantAdmin || isSuperAdmin);

  return (
    <>
      <SidebarSpacesZone
        canCreate={canManage}
        emptyHint={t("spaces.rail.emptyForMember")}
        labels={{
          allSpaces: t("spaces.rail.allSpaces"),
          manage: t("spaces.manageAction"),
          newSpace: t("spaces.newAction"),
          spaces: t("spaces.title"),
          stack: (hiddenCount: number) =>
            t("spaces.rail.moreSpaces", { count: hiddenCount }),
          switchSpace: t("spaces.switcherAriaLabel", {
            defaultValue: "Switch space",
          }),
        }}
        onCreateSpace={() => setCreateOpen(true)}
        // The full switcher is the spaces list until Phase 5's search lands;
        // a real destination beats a dead control.
        onOpenSwitcher={() => navigate("/settings/spaces")}
        pending={spacesQuery.isPending}
        resolved={resolved}
        spaceHref={(space) => spaceRootPath(space.key)}
      />
      {canManage ? (
        <SpaceSetupDialog onOpenChange={setCreateOpen} open={createOpen} />
      ) : null}
    </>
  );
}
