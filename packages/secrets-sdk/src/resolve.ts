import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The SINGLE authority for "may this principal read the plaintext of secret X".
 * Called only from the server-side reveal path (service-role client). RLS gives
 * coarse (tenant+scope) row visibility; this refines it to owner_scope
 * membership + explicit/goal grants. See docs/wip/secrets-vault-module.md §5.
 *
 * OPEN INTEGRATION POINTS (R4): isAssignedToClient / isProjectMember depend on
 * membership sources that are not finalised — wire them to the decided source
 * before enabling client/project reveal for non-admins.
 */

export type Principal =
  | { kind: "user"; id: string }
  | { kind: "agent"; id: string; goalId?: string | null };

export interface SecretRow {
  id: string;
  owner_id: string;
  owner_scope: "user" | "project" | "client" | "tenant";
}

export interface ResolveDeps {
  hasSecretGrant(secretId: string, p: Principal): Promise<boolean>;
  isAssignedToClient(userId: string, clientId: string): Promise<boolean>;
  isProjectMember(userId: string, projectId: string): Promise<boolean>;
  listGoalGrantCapabilities(
    tenantId: string,
    goalId: string,
    agentId: string
  ): Promise<string[]>;
}

export async function canReadSecret(
  _db: SupabaseClient,
  input: { tenantId: string; principal: Principal; secret: SecretRow },
  deps: ResolveDeps
): Promise<boolean> {
  const { tenantId, principal, secret } = input;

  // 1. explicit durable grant (either principal kind)
  if (await deps.hasSecretGrant(secret.id, principal)) {
    return true;
  }

  // 2. agent goal-scoped grant via core.agent_goal_grants (concrete cap, no wildcard)
  if (principal.kind === "agent" && principal.goalId) {
    const caps = await deps.listGoalGrantCapabilities(
      tenantId,
      principal.goalId,
      principal.id
    );
    if (caps.includes(`secrets.read:${secret.id}`)) {
      return true;
    }
  }

  // 3. users: scope membership of the secret's owner_scope
  if (principal.kind === "user") {
    switch (secret.owner_scope) {
      case "user":
        return secret.owner_id === principal.id;
      case "tenant":
        return true; // in-tenant + has module.secrets.read (checked at the route)
      case "client":
        return deps.isAssignedToClient(principal.id, secret.owner_id);
      case "project":
        return deps.isProjectMember(principal.id, secret.owner_id);
    }
  }
  return false;
}
