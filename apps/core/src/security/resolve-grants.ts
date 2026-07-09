import type { RoleProfile } from "@engenty/plugin-sdk";

/**
 * The subject a grant is resolved for: a tenant user (with their base tenant
 * role and superadmin flag) or an agent. Grants are always resolved inside one
 * tenant.
 */
export type GrantSubject =
  | {
      kind: "user";
      id: string;
      tenantRole: "admin" | "member" | null;
      isSuperAdmin: boolean;
    }
  | { kind: "agent"; id: string };

export interface PrincipalGrants {
  capabilities: string[];
  roleProfiles: string[];
}

/** Minimal registry surface resolveGrants needs (satisfied by RoleProfileRegistry). */
export interface RoleProfileLookup {
  get: (id: string) => RoleProfile | undefined;
}

export interface ResolveGrantsDeps {
  /** Optional Phase 7 hook: resolve a tenant-defined custom role. */
  getTenantRole?: (
    tenantId: string,
    roleId: string
  ) => Promise<RoleProfile | undefined>;
  /** DB-backed: role ids explicitly assigned to this subject in this tenant. */
  listAssignedRoleIds: (
    tenantId: string,
    subject: GrantSubject
  ) => Promise<string[]>;
  registry: RoleProfileLookup;
}

/**
 * Resolve a principal's effective grants: their base role (from tenant
 * membership / superadmin / agent floor) unioned with any explicitly assigned
 * role profiles, flattened to capability strings.
 *
 * Behavior-preserving in Phase 1: with no assignments, admin → `*`,
 * member → today's 4 settings caps, superadmin → `["core.superadmin","*"]`.
 */
export async function resolveGrants(
  deps: ResolveGrantsDeps,
  subject: GrantSubject,
  tenantId: string
): Promise<PrincipalGrants> {
  if (subject.kind === "user" && subject.isSuperAdmin) {
    return {
      roleProfiles: ["core.superadmin"],
      capabilities: ["core.superadmin", "*"],
    };
  }

  const base =
    subject.kind === "agent"
      ? "agent.assistant" // capable read+write by default; actions gated to approval
      : subject.tenantRole === "admin"
        ? "tenant.admin"
        : subject.tenantRole === "member"
          ? "tenant.member"
          : null; // a user who is not a member of this tenant → no grants

  if (subject.kind === "user" && base === null) {
    return { roleProfiles: [], capabilities: [] };
  }

  const assigned = await deps.listAssignedRoleIds(tenantId, subject);
  const roleProfiles = [...new Set([...(base ? [base] : []), ...assigned])];

  const capabilities: string[] = [];
  const seenCap = new Set<string>();
  for (const id of roleProfiles) {
    let profile = deps.registry.get(id);
    if (!profile && deps.getTenantRole) {
      // eslint-disable-next-line no-await-in-loop -- small, cached list
      profile = await deps.getTenantRole(tenantId, id);
    }
    if (!profile) {
      continue; // unknown role id → ignored (never grants)
    }
    for (const cap of profile.capabilities) {
      if (!seenCap.has(cap)) {
        seenCap.add(cap);
        capabilities.push(cap);
      }
    }
  }

  return { roleProfiles, capabilities };
}

/**
 * Small TTL cache around a `listAssignedRoleIds` DAL call. Three indexed reads
 * per request otherwise. Invalidate on assignment writes via `invalidate`.
 */
export function createAssignedRoleIdsCache(
  loader: (tenantId: string, subject: GrantSubject) => Promise<string[]>,
  options: { ttlMs?: number; now?: () => number } = {}
): {
  listAssignedRoleIds: (
    tenantId: string,
    subject: GrantSubject
  ) => Promise<string[]>;
  invalidate: (tenantId: string, subjectId?: string) => void;
  clear: () => void;
} {
  const ttlMs = options.ttlMs ?? 30_000;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, { expires: number; value: string[] }>();

  const keyFor = (tenantId: string, subject: GrantSubject) =>
    `${tenantId}:${subject.kind}:${subject.id}`;

  return {
    async listAssignedRoleIds(tenantId, subject) {
      const key = keyFor(tenantId, subject);
      const hit = cache.get(key);
      const ts = now();
      if (hit && hit.expires > ts) {
        return hit.value;
      }
      const value = await loader(tenantId, subject);
      cache.set(key, { value, expires: ts + ttlMs });
      return value;
    },
    invalidate(tenantId, subjectId) {
      if (!subjectId) {
        for (const k of [...cache.keys()]) {
          if (k.startsWith(`${tenantId}:`)) {
            cache.delete(k);
          }
        }
        return;
      }
      for (const k of [...cache.keys()]) {
        if (k.startsWith(`${tenantId}:`) && k.endsWith(`:${subjectId}`)) {
          cache.delete(k);
        }
      }
    },
    clear() {
      cache.clear();
    },
  };
}
