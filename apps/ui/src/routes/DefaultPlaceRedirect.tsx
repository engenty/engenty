/**
 * `/`, unknown URLs, leftover auth paths, and admin pages a member cannot
 * open used to dump you on Copilot chat — the pre-spaces default. Copilot is
 * the dock now. Send people to a Space home instead: last visited, then
 * personal, then the tenant default.
 *
 * A link followed while signed out wins over all of that: login lands here,
 * and the remembered path is where the visitor was going.
 */
import { COPILOT_RIVER_PATH } from "@engenty/ai-ui";
import { clearReturnPath, peekReturnPath } from "@engenty/auth-ui";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { pickLandingSpace, rememberedSpaceKey } from "@/lib/landing-space";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

export function DefaultPlaceRedirect() {
  const spacesQuery = useSpacesQuery();
  const [returnPath] = useState(peekReturnPath);
  useEffect(() => {
    if (returnPath) {
      clearReturnPath();
    }
  }, [returnPath]);

  if (returnPath) {
    return <Navigate replace to={returnPath} />;
  }
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
