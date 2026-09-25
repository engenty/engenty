import { requestApiJson } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import { useWorkspaceTenant } from "@engenty/ui-plugin-sdk";
import {
  type ConnectionSpaceRef,
  findPersonalSpace,
} from "../lib/connection-space.js";

const SPACES_KEY = ["connections", "spaces"] as const;

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

/** The viewer's personal Space id (`/s/me`), or null until it resolves. */
export function usePersonalSpaceId(): string | null {
  const { currentUserId } = useWorkspaceTenant();
  const spaces = useConnectionSpacesQuery();
  return findPersonalSpace(spaces.data ?? [], currentUserId)?.id ?? null;
}

/**
 * The Space a connect lands in: the given one, else the personal Space.
 * Null while the personal Space is still loading.
 */
export function useConnectSpaceId(spaceId?: string | null): string | null {
  const personal = usePersonalSpaceId();
  return spaceId ?? personal;
}

/**
 * May the viewer change settings / policies / disconnect this Space's
 * accounts? Space owners and tenant admins. A HINT for rendering — the server
 * enforces it.
 */
export function useCanManageSpaceConnections(spaceId: string | null): boolean {
  const { currentUserId, isSuperAdmin, isTenantAdmin } = useWorkspaceTenant();
  const spaces = useConnectionSpacesQuery();
  const isAdmin = isSuperAdmin || isTenantAdmin;
  const space = spaces.data?.find((entry) => entry.id === spaceId) ?? null;
  const ownsPersonal =
    Boolean(space) &&
    currentUserId !== null &&
    space?.ownerUserId === currentUserId;
  const membersQuery = useQuery({
    enabled: Boolean(spaceId) && !isAdmin && !ownsPersonal,
    queryFn: ({ signal }) =>
      requestApiJson<SpaceMemberRef[]>(
        `/api/spaces/${encodeURIComponent(spaceId as string)}/members`,
        { signal }
      ),
    queryKey: [...SPACES_KEY, "members", spaceId ?? ""],
    staleTime: 60_000,
  });
  if (!spaceId) {
    return false;
  }
  if (isAdmin || ownsPersonal) {
    return true;
  }
  return (membersQuery.data ?? []).some(
    (member) => member.userId === currentUserId && member.role === "owner"
  );
}
