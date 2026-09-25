/**
 * Who may do what with a Space's connections (PLAN-space-owned-connections.md).
 *
 * - **Enter** a Space (see and use its accounts, connect a new one): the same
 *   rule core enforces on `/s/<key>` — the Space is open, or you own it, or
 *   you have a member row.
 * - **Manage** a Space's accounts (settings, policies, disconnect, approval
 *   decisions): the Space's owners — `core.spaces.owner_user_id` (personal
 *   Space) or a `space_member` row with role `owner` — plus tenant admins
 *   holding `core.users.manage`.
 *
 * The Space rows are read by `readSpaceAccess` (connections-sdk) on the
 * tenant-locked server handle, whose JWT subject is not the user: these
 * predicates are the enforcement on this lane, not a convenience over RLS.
 */
import type { SpaceAccessMap } from "@engenty/connections-sdk";
import { capabilityCovers } from "@engenty/plugin-sdk";

export type ResolveSpaceAccess = (params: {
  tenantId: string;
  userId: string;
}) => Promise<SpaceAccessMap>;

export function isTenantAdmin(auth: { capabilities?: string[] }): boolean {
  return capabilityCovers([...(auth.capabilities ?? [])], "core.users.manage");
}

/** May this caller change and decide for accounts owned by `spaceId`? */
export function canManageSpace(
  access: SpaceAccessMap,
  auth: { capabilities?: string[] },
  spaceId: string
): boolean {
  return access.get(spaceId)?.isOwner === true || isTenantAdmin(auth);
}

/**
 * May this person act in `spaceId` — see and use its accounts, connect a new
 * one? Tenant admins may act in every Space of their tenant.
 */
export async function mayEnterSpace(
  resolve: ResolveSpaceAccess,
  auth: { capabilities?: string[]; principalId: string; tenantId: string },
  spaceId: string
): Promise<boolean> {
  if (isTenantAdmin(auth)) {
    return true;
  }
  const access = await resolve({
    tenantId: auth.tenantId,
    userId: auth.principalId,
  });
  return access.has(spaceId);
}
