/**
 * `/`, unknown URLs, leftover auth paths, and admin pages a member cannot
 * open used to dump you on Copilot chat — the pre-spaces default. Copilot is
 * the dock now. Send people to a Space home instead: last visited, then
 * personal, then the tenant default.
 */
import { COPILOT_RIVER_PATH } from "@engenty/ai-ui";
import { Navigate } from "react-router-dom";
import { pickLandingSpace, rememberedSpaceKey } from "@/lib/landing-space";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

export function DefaultPlaceRedirect() {
  const spacesQuery = useSpacesQuery();

  if (spacesQuery.isPending) {
    return null;
  }

  const target = pickLandingSpace(spacesQuery.data ?? [], rememberedSpaceKey());
  if (!target) {
    // No space at all is a broken install, not a state to design a screen for.
    return <Navigate replace to={COPILOT_RIVER_PATH} />;
  }
  return <Navigate replace to={spaceRootPath(target.key)} />;
}
