/**
 * The space the copilot considers itself in, for this URL.
 *
 * One hook, two readers, on purpose. The copilot's thread binding writes this
 * id into `routeContext.scope` (which is what a NEW thread is filed under), and
 * the threads provider keys the PERSISTED active thread by it (which is what an
 * EXISTING thread is resumed from). If those two ever answered differently, the
 * dock would resume a thread from one space and record the next one in another
 * — and the mismatch would only show up later, as an agent reaching for tools
 * the space in the address bar never mounted.
 *
 * Deliberately NOT `useRouteSpace`: outside `/s/…` that falls back to the
 * TENANT DEFAULT, which is the shared Company space. The personal desk
 * (`/mdl/engenty-copilot`) files new threads into the PERSONAL space instead —
 * quietly filing a colleague-free thought into Company is the kind of
 * surprise nobody reports as a bug (PLAN-spaces.md Phase C2).
 */
import { useLocation } from "react-router-dom";
import { isPersonalSpace } from "@/lib/api/spaces-client";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { resolveCopilotSpaceId } from "./copilot-space";

export function useCopilotSpaceId(): string | null {
  const location = useLocation();
  const spacesQuery = useSpacesQuery();
  // Not memoised on the query DATA object: `useSpacesQuery` returns a stable
  // reference between refetches, and the mapping below is a handful of rows.
  return resolveCopilotSpaceId({
    pathname: location.pathname,
    spaces: (spacesQuery.data ?? []).map((space) => ({
      id: space.id,
      isPersonal: isPersonalSpace(space),
      key: space.key,
    })),
  });
}
