import { getUsersByIds } from "../dal/core-users/crud.js";
import { createDatabaseAdapter } from "../infra/index.js";

export interface AuditActorUser {
  avatar_url: string | null;
  full_name: string;
  id: string;
  initials?: string | null;
}

export interface AuditEventWithDetail {
  actor_id: string | null;
  detail: Record<string, unknown>;
  id: string;
  module_id: string | null;
  operation_id: string | null;
  source_component: string | null;
  source_kind: string;
  source_module_id: string | null;
  tenant_id: string | null;
  timestamp: string;
  type: string;
}

/**
 * Attach display `user` from core.users for accountability in list UIs.
 * Best-effort: lookup failures leave `user: null` without failing the feed.
 */
export async function enrichAuditEventsWithUsers(
  config: Record<string, unknown>,
  events: AuditEventWithDetail[],
  options?: { tenantId?: string }
): Promise<Array<AuditEventWithDetail & { user: AuditActorUser | null }>> {
  const actorIds = [
    ...new Set(
      events
        .map((e) => e.actor_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  if (actorIds.length === 0) {
    return events.map((e) => ({ ...e, user: null }));
  }

  let usersById: Map<
    string,
    {
      display_name: string | null;
      email: string;
      id: string;
      initials: string | null;
    }
  >;
  try {
    const client = createDatabaseAdapter(config);
    if (!client) {
      return events.map((e) => ({ ...e, user: null }));
    }
    usersById = await getUsersByIds(client, actorIds, {
      tenantId: options?.tenantId,
    });
  } catch {
    return events.map((e) => ({ ...e, user: null }));
  }

  return events.map((event) => {
    const row = event.actor_id ? usersById.get(event.actor_id) : undefined;
    if (!row) {
      return { ...event, user: null };
    }
    const fullName = row.display_name?.trim() || row.email;
    return {
      ...event,
      user: {
        id: row.id,
        full_name: fullName,
        avatar_url: null,
        initials: row.initials,
      },
    };
  });
}
