/**
 * The space the copilot's next turn happens in, for this URL — null outside a
 * space. See `resolveCopilotSpaceId` for why null and not a default.
 */
import { useLocation } from "react-router-dom";
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
      key: space.key,
    })),
  });
}
