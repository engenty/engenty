/**
 * `/s/me/…` → `/s/<your-key>/…` (PLAN-spaces.md Phase P3).
 *
 * The `~` of this system, and like `~` it is expanded on use rather than stored.
 * `replace` is load-bearing: the alias resolves per viewer, so leaving it in
 * history — or worse, in the address bar for someone to copy — would turn "here
 * is the space I mean" into a link that sends each reader to their own.
 *
 * Landing order when nothing is aliased: last-visited, then personal, then the
 * tenant default. Personal sits in the middle deliberately — going back where
 * you were beats going somewhere correct-but-unasked-for, and the default space
 * is the answer only for someone whose personal space does not exist yet
 * (a user whose row predates the Phase P backfill).
 */
import { Navigate, useLocation, useParams } from "react-router-dom";
import { isPersonalSpace } from "@/lib/api/spaces-client";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

export function PersonalSpaceRedirect() {
  const location = useLocation();
  const params = useParams();
  const spacesQuery = useSpacesQuery();

  if (spacesQuery.isPending) {
    return null;
  }

  const spaces = spacesQuery.data ?? [];
  const target =
    spaces.find(isPersonalSpace) ??
    spaces.find((space) => space.isDefault) ??
    spaces[0];

  if (!target) {
    // No space at all is a broken install (every tenant has a Company space by
    // trigger), not a state to design a screen for.
    return <Navigate replace to="/" />;
  }

  // Carry the rest of the path through, so `/s/me/tasks/briefing` lands on the
  // same page inside the resolved space rather than dumping you at its root.
  const rest = params["*"] ?? "";
  const suffix = rest ? `/${rest}` : "";
  return (
    <Navigate
      replace
      to={`${spaceRootPath(target.key)}${suffix}${location.search}${location.hash}`}
    />
  );
}
