import type { PluginProfilePolicy } from "@engenty/plugin-sdk";
import { canReadSecret, type Principal } from "@engenty/secrets-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildResolveDeps } from "./api/reveal-routes.js";

/**
 * R10 resolution — the AGENT reveal gate. Only the profile-policy layer sees
 * `agentId`/`goalId`/`principalType` (PluginPolicyAuthContext), so agent
 * authorization for `secrets_reveal` lives HERE, not in the operation handler.
 * Mirrors `createConnectionsProfilePolicy` + `createAgentEscalationPolicy`:
 *
 *   effective agent access = explicit secret_grants ∪ goal grants
 *   (core.agent_goal_grants, concrete `secrets.read:<id>`, no wildcards)
 *
 * In the gap → `require_approval`: in chat the present human approves in-context;
 * approving with "allow for this goal" inserts an agent_goal_grant so the rest of
 * the run proceeds. For non-agent (human) callers the policy ABSTAINS (null) and
 * the operation handler's own user-scope resolve governs.
 *
 * The acting user's own capability ceiling is still enforced upstream on the
 * forwarded token — this policy only governs the agent band.
 */
export function createSecretsRevealPolicy(
  /** Tenant-locked handle factory (Phase A) — resolved per evaluated call. */
  getDb: (auth: { tenantId: string }) => SupabaseClient
): PluginProfilePolicy {
  return async (input) => {
    if (input.operationId !== "secrets_reveal") {
      return null; // not our operation
    }
    const agentId = input.auth.agentId;
    if (!agentId) {
      return null; // human path — handler resolves as user
    }
    const secretId = (input.input as { secret_id?: string } | undefined)
      ?.secret_id;
    if (!secretId) {
      return null; // malformed; the handler will 400
    }
    const tenantDb = getDb({ tenantId: input.auth.tenantId });

    // Load owner for the resolve (tenant-locked read; the explicit tenant
    // filter below stays as the belt).
    const { data: secret } = await tenantDb
      .schema("module_secrets")
      .from("secrets")
      .select("id, owner_scope, owner_id")
      .eq("id", secretId)
      .eq("tenant_id", input.auth.tenantId)
      .is("deleted_at", null)
      .single();
    if (!secret) {
      return null; // handler 404s; nothing to pre-approve
    }

    const principal: Principal = {
      kind: "agent",
      id: agentId,
      goalId: input.auth.goalId ?? null,
    };
    const allowed = await canReadSecret(
      tenantDb,
      { tenantId: input.auth.tenantId, principal, secret },
      buildResolveDeps(tenantDb, input.auth)
    );
    if (allowed) {
      return null; // within agent grants (± goal grants) → allow
    }
    return {
      action: "require_approval",
      reason: `secrets_reveal: agent needs approval to read "${secret.id}"${
        input.auth.actingForUserId ? " (acting for you)" : ""
      }`,
    };
  };
}
