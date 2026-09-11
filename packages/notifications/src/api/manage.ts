// Who may shape a stream: a tenant admin (`notifications.manage`) anywhere,
// or the owner of the space the stream belongs to. A space owner routing that
// space's own stream into their messenger is exactly what streams are for;
// tenant-global streams stay an admin's.
export interface ManageAuth {
  capabilities?: string[];
  userId: string | null;
}

export interface ManageDeps {
  isSpaceOwner(input: {
    spaceId: string;
    tenantId: string;
    userId: string;
  }): Promise<boolean>;
}

export function hasManageCapability(auth: ManageAuth): boolean {
  const caps = auth.capabilities ?? [];
  return caps.includes("*") || caps.includes("notifications.manage");
}

export async function canManageStream(
  auth: ManageAuth,
  input: { spaceId: string | null; tenantId: string },
  deps: ManageDeps
): Promise<boolean> {
  if (hasManageCapability(auth)) {
    return true;
  }
  if (!(input.spaceId && auth.userId)) {
    return false;
  }
  return deps.isSpaceOwner({
    spaceId: input.spaceId,
    tenantId: input.tenantId,
    userId: auth.userId,
  });
}
