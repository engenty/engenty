import { requestApiJson } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import { useWorkspaceTenant } from "@engenty/ui-plugin-sdk";

const SPACES_KEY = ["connections", "spaces"] as const;

/** The fields of core's `/api/spaces` row this module reads. */
export interface ConnectionSpaceRef {
  id: string;
  key: string;
  name: string;
}

interface SpaceMemberRef {
  role: "member" | "owner";
  userId: string;
}

/** Spaces the viewer is in (membership-filtered by core). */
export function useConnectionSpacesQuery() {
  return useQuery({
    queryFn: ({ signal }) =>
      requestApiJson<ConnectionSpaceRef[]>("/api/spaces", { signal }),
    queryKey: SPACES_KEY,
    staleTime: 60_000,
  });
}

/**
 * May the viewer change settings / policies / disconnect these accounts? Their
 * own (`null`) always; a Space's for its owners and tenant admins. A HINT for
 * rendering — the server enforces it.
 */
export function useCanManageSpaceConnections(target: string | null): boolean {
  const { currentUserId, isSuperAdmin, isTenantAdmin } = useWorkspaceTenant();
  const isAdmin = isSuperAdmin || isTenantAdmin;
  const membersQuery = useQuery({
    enabled: Boolean(target) && !isAdmin,
    queryFn: ({ signal }) =>
      requestApiJson<SpaceMemberRef[]>(
        `/api/spaces/${encodeURIComponent(target as string)}/members`,
        { signal }
      ),
    queryKey: [...SPACES_KEY, "members", target ?? ""],
    staleTime: 60_000,
  });
  if (!target || isAdmin) {
    return true;
  }
  return (membersQuery.data ?? []).some(
    (member) => member.userId === currentUserId && member.role === "owner"
  );
}
