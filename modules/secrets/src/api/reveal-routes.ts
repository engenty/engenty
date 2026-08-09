import {
  grantCapabilityForGoal,
  listGoalGrantCapabilities,
} from "@engenty/approvals-sdk";
import { foreignSelect, type PluginServerApi } from "@engenty/plugin-sdk";
import {
  canReadSecret,
  decryptPayload,
  type Principal,
  secretAad,
  staticKeyWrapper,
} from "@engenty/secrets-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const SCHEMA = "module_secrets";

/**
 * How long an in-chat "yes, this agent may read that secret" stays good.
 * Long enough to cover the conversation it was given in, short enough that an
 * abandoned goal stops carrying live secret access.
 */
const GOAL_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The row an approved in-chat reveal writes to `core.agent_goal_grants`.
 *
 * `agent_id: null` means "any agent on this goal", matching canReadSecret's
 * goal-grant branch. The expiry is what makes the grant's stated lifetime —
 * dies with the conversation — actually true: nothing reaps these rows when a
 * goal reaches a terminal status, so an unbounded row would authorize every
 * future agent on that goal forever. A lapsed grant just re-gates the reveal
 * and asks the human again, which is how a secret grant should fail.
 */
export function buildGoalGrantRow(input: {
  capability: string;
  goalId: string;
  grantedBy: string;
  now?: number;
  tenantId: string;
}) {
  return {
    agent_id: null,
    capability: input.capability,
    expires_at: new Date(
      (input.now ?? Date.now()) + GOAL_GRANT_TTL_MS
    ).toISOString(),
    goal_id: input.goalId,
    granted_by: input.grantedBy,
    tenant_id: input.tenantId,
  };
}

/**
 * The ONLY path that returns plaintext. Server-side decrypt, gated by
 * resolve.canReadSecret (owner_scope membership + grants), and every call is
 * written to access_log. Never exposed as a column grant. See plan §5.
 *
 * ROADBLOCK R10 (CONFIRMED against plugin-sdk `PluginAuthContext`): a route/
 * operation *handler* sees only { principalId, scopeId, tenantId, capabilities }
 * — NOT agentId/goalId/principalType. Those exist only in
 * `PluginPolicyAuthContext` (the profile-policy layer). So the agent reveal path
 * cannot be authorized in a handler; it is gated by `createSecretsRevealPolicy`
 * (see policy.ts) which fires on the `secrets_reveal` operation, evaluates
 * agent_goal_grants via resolve.ts, and escalates the gap to approval — exactly
 * the connections pattern. This HTTP route is the HUMAN path only: principalId
 * is always a user here, so it resolves as a user principal.
 */
export function registerSecretsRevealRoutes(
  server: PluginServerApi,
  supabase: SupabaseClient
): void {
  const db = () => supabase.schema(SCHEMA);

  server.registerHttpRoute({
    method: "post",
    path: "/api/secrets/:id/reveal",
    summary: "Decrypt and return a secret's payload (audited)",
    async handler(ctx) {
      const hono = ctx.hono as { json: (d: unknown, s?: number) => unknown };
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const secretId = (ctx.params as { id?: string })?.id;
      if (!secretId) {
        return hono.json({ error: "Missing id" }, 400);
      }

      // RLS (tenant+scope) applies via the request's forwarded token elsewhere;
      // here we use the service-role client and re-check tenant explicitly.
      const { data: secret, error } = await db()
        .from("secrets")
        .select(
          "id, tenant_id, owner_scope, owner_id, kind, payload_enc, dek_id"
        )
        .eq("id", secretId)
        .is("deleted_at", null)
        .single();
      if (error || !secret || secret.tenant_id !== ctx.auth.tenantId) {
        return hono.json({ error: "Not found" }, 404);
      }

      // Human path only (see R10): a handler's ctx.auth has no agentId/goalId,
      // so principalId is always a user here. Agent reveal goes through the
      // secrets_reveal operation + createSecretsRevealPolicy gate.
      const principal: Principal = { kind: "user", id: ctx.auth.principalId };

      const allowed = await canReadSecret(
        supabase,
        { tenantId: ctx.auth.tenantId, principal, secret },
        buildResolveDeps(supabase, ctx.auth)
      );
      if (!allowed) {
        return hono.json({ error: "Forbidden" }, 403);
      }

      const key = await staticKeyWrapper.keyForDecrypt(
        ctx.auth.tenantId,
        secret.dek_id
      );
      let payload: unknown;
      try {
        payload = JSON.parse(
          decryptPayload(
            secret.payload_enc,
            key,
            secretAad({
              secretId: secret.id,
              ownerScope: secret.owner_scope,
              ownerId: secret.owner_id,
            })
          )
        );
      } catch {
        return hono.json({ error: "Decryption failed" }, 500);
      }

      await db().from("access_log").insert({
        tenant_id: ctx.auth.tenantId,
        secret_id: secret.id,
        principal_id: principal.id,
        principal_kind: "user",
        action: "reveal",
        goal_id: null,
      });

      return hono.json({ id: secret.id, kind: secret.kind, payload });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/secrets/:id/goal-grants",
    summary:
      "Grant agents on a goal (conversation) read access to one secret — the durable half of an in-chat approval",
    request: { body: z.object({ goal_id: z.string().uuid() }) },
    async handler(ctx) {
      const hono = ctx.hono as { json: (d: unknown, s?: number) => unknown };
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      // A HUMAN decision endpoint: the approving user's own bearer token. An
      // agent-driven call must never mint its own grant.
      if (ctx.auth.agentId) {
        return hono.json({ error: "Forbidden" }, 403);
      }
      const secretId = (ctx.params as { id?: string })?.id;
      const goalId = (ctx.body as { goal_id: string }).goal_id;
      if (!secretId) {
        return hono.json({ error: "Missing id" }, 400);
      }

      const { data: secret, error } = await db()
        .from("secrets")
        .select("id, tenant_id, owner_scope, owner_id")
        .eq("id", secretId)
        .is("deleted_at", null)
        .single();
      if (error || !secret || secret.tenant_id !== ctx.auth.tenantId) {
        return hono.json({ error: "Not found" }, 404);
      }

      // Ceiling: the approver must be able to reveal this secret THEMSELVES —
      // an approval can delegate the user's own access, never exceed it.
      const principal: Principal = { kind: "user", id: ctx.auth.principalId };
      const allowed = await canReadSecret(
        supabase,
        { tenantId: ctx.auth.tenantId, principal, secret },
        buildResolveDeps(supabase, ctx.auth)
      );
      if (!allowed) {
        return hono.json({ error: "Forbidden" }, 403);
      }

      const row = buildGoalGrantRow({
        capability: `secrets.read:${secret.id}`,
        goalId,
        grantedBy: ctx.auth.principalId,
        tenantId: ctx.auth.tenantId,
      });
      try {
        await grantCapabilityForGoal(supabase, {
          agentId: row.agent_id,
          capability: row.capability,
          expiresAt: row.expires_at,
          goalId: row.goal_id,
          grantedBy: row.granted_by,
          tenantId: row.tenant_id,
        });
      } catch {
        return hono.json({ error: "Grant failed" }, 500);
      }
      return hono.json({ ok: true });
    },
  });
}

/**
 * Wires resolve.ts to concrete membership sources. R4: isAssignedToClient /
 * isProjectMember point at the membership source decided in Phase 0. Stubs here
 * default-deny (safe) until wired.
 *
 * `scopeId` is optional because the two caller kinds differ: route and
 * operation handlers carry a concrete `ctx.auth.scopeId`, while the profile
 * policy sees a `PrincipalContext` that has none. That is safe rather than a
 * hole — the policy path only ever resolves an *agent* principal, and
 * `canReadSecret` reaches the membership checks below only for `kind: "user"`
 * (see secrets-sdk resolve.ts). Without a scope the membership checks
 * default-deny outright, so a future caller that does reach them with no scope
 * fails closed instead of reading across scopes.
 */
export function buildResolveDeps(
  supabase: SupabaseClient,
  auth: { scopeId?: string; tenantId: string }
) {
  const { tenantId } = auth;
  const db = () => supabase.schema(SCHEMA);
  /** Tenant boundary for cross-schema reads, or null when unscoped → deny. */
  const scope = auth.scopeId ? { scopeId: auth.scopeId, tenantId } : null;
  return {
    async hasSecretGrant(secretId: string, p: Principal) {
      const col = p.kind === "agent" ? "agent_id" : "user_id";
      const { data } = await db()
        .from("secret_grants")
        .select("id, expires_at")
        .eq("secret_id", secretId)
        .eq(col, p.id);
      const now = Date.now();
      return (data ?? []).some(
        (r) => !r.expires_at || Date.parse(r.expires_at) > now
      );
    },
    listGoalGrantCapabilities(_t: string, goalId: string, agentId: string) {
      return listGoalGrantCapabilities(supabase, { agentId, goalId, tenantId });
    },
    // R4 (resolved) — access to a client-owned secret flows through PROJECT
    // membership: a user is "assigned to a client" iff they are on the team of
    // some project that references that client (projects.client_id). Plus the
    // direct secret_grants path above. Managed via UI/mass-edit.
    // Coupling note: these query module_projects; if that module isn't
    // installed the schema is absent → treat as no membership (default deny).
    //
    // Tenant boundary: `module_projects.project_team` carries tenant_id and
    // scope_id of its own, held equal to the parent project by a composite FK
    // (see 20260809120000_plugin_module_projects_project_team_tenant.sql). The
    // client here is service-role and bypasses RLS, so these filters ARE the
    // boundary — without them a project id from another tenant reads as
    // membership and grants a secret reveal.
    async isProjectMember(userId: string, projectId: string) {
      if (!scope) {
        return false;
      }
      try {
        const { data } = await foreignSelect(supabase, scope, {
          columns: "user_id",
          schema: "module_projects",
          table: "project_team",
        })
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .limit(1);
        return ((data ?? []) as unknown[]).length > 0;
      } catch {
        return false;
      }
    },
    async isAssignedToClient(userId: string, clientId: string) {
      if (!scope) {
        return false;
      }
      try {
        // project_team.project_id → projects (client_id = clientId, in scope)
        const { data: projects } = await foreignSelect(supabase, scope, {
          columns: "id",
          schema: "module_projects",
          table: "projects",
        }).eq("client_id", clientId);
        const projectIds = ((projects ?? []) as { id: string }[]).map(
          (p) => p.id
        );
        if (projectIds.length === 0) {
          return false;
        }
        const { data } = await foreignSelect(supabase, scope, {
          columns: "project_id",
          schema: "module_projects",
          table: "project_team",
        })
          .eq("user_id", userId)
          .in("project_id", projectIds)
          .limit(1);
        return ((data ?? []) as unknown[]).length > 0;
      } catch {
        return false;
      }
    },
  };
}
