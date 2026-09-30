/**
 * Who a newly connected account will belong to (PLAN-personal-connections.md):
 * the caller themselves (`owner=me`) or a Space they can enter (`space_id`).
 * Only a person can own an account; a Space account needs the caller to be
 * able to enter that Space. Shared by every connect route.
 */
import type { ConnectionOwner } from "./repo.js";

export type ConnectOwnerResult =
  | { owner: ConnectionOwner }
  | {
      error:
        | "connections.ownerRequired"
        | "connections.personalNeedsPerson"
        | "space_not_found";
      status: 400 | 403 | 404;
    };

export async function resolveConnectOwner(params: {
  auth: {
    principalId: string;
    principalType?: "user" | "agent" | "service";
  };
  /** May the caller enter this Space? */
  mayEnterSpace: (spaceId: string) => Promise<boolean>;
  /** `"me"` connects a personal account of the caller. */
  owner?: string | null;
  spaceId?: string | null;
}): Promise<ConnectOwnerResult> {
  if (params.owner === "me") {
    if ((params.auth.principalType ?? "user") !== "user") {
      return { error: "connections.personalNeedsPerson", status: 403 };
    }
    return { owner: { userId: params.auth.principalId } };
  }
  const spaceId = params.spaceId?.trim();
  if (!spaceId) {
    return { error: "connections.ownerRequired", status: 400 };
  }
  if (!(await params.mayEnterSpace(spaceId))) {
    return { error: "space_not_found", status: 404 };
  }
  return { owner: { spaceId } };
}

/** The flow row's `space_id` for an owner: null means the flow's own user. */
export function flowSpaceId(owner: ConnectionOwner): string | null {
  return "spaceId" in owner ? owner.spaceId : null;
}
