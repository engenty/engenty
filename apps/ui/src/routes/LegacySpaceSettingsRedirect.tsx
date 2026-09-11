/**
 * `/settings/spaces/<uuid>` → `/s/<key>/settings` (PLAN-spaces.md Phase 4).
 *
 * The old URL is in bookmarks, in the sidebar's Settings link as shipped, and
 * in any breadcrumb a user copied — so it redirects rather than 404s. It
 * resolves the key from the id, which means it can only ever land on a space
 * the caller can see: `/api/spaces` is membership-filtered, so an id the viewer
 * has no access to falls through to the spaces list instead of confirming that
 * the space exists.
 */
import { Navigate, useParams } from "react-router-dom";
import { spaceSettingsPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

export function LegacySpaceSettingsRedirect() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const spacesQuery = useSpacesQuery();

  if (spacesQuery.isPending) {
    return null;
  }
  const space = (spacesQuery.data ?? []).find((item) => item.id === spaceId);
  return (
    <Navigate
      replace
      to={space ? spaceSettingsPath(space.key) : "/settings/spaces"}
    />
  );
}
