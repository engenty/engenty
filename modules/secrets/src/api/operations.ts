import { actorUserIdFromAuth, type PluginServerApi } from "@engenty/plugin-sdk";
import {
  canReadSecret,
  decryptPayload,
  encryptPayload,
  type Principal,
  secretAad,
  staticKeyWrapper,
} from "@engenty/secrets-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildResolveDeps } from "./reveal-routes.js";

const SCHEMA = "module_secrets";

const ownerScope = z.enum(["user", "project", "client", "tenant"]);
const kind = z.enum([
  "username_password",
  "api_key",
  "key_list",
  "credit_card",
  "note",
]);

// Named input schemas so handlers can cast `input` (typed `unknown` by the host,
// already validated against inputSchema before dispatch — same pattern as
// modules/connections/src/api/operations.ts).
const listInput = z
  .object({
    owner_scope: ownerScope.optional(),
    owner_id: z.string().optional(),
    query: z.string().optional(),
  })
  .optional();
const createInput = z.object({
  owner_scope: ownerScope,
  owner_id: z.string(),
  name: z.string().min(1),
  kind,
  url: z.string().optional(),
  description: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  project_ids: z.array(z.string().uuid()).optional(),
});
const revealInput = z.object({ secret_id: z.string().uuid() });
const updateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  project_ids: z.array(z.string().uuid()).optional(),
});
const deleteInput = z.object({ id: z.string().uuid() });
const moveInput = z.object({
  id: z.string().uuid(),
  owner_scope: ownerScope,
  owner_id: z.string(),
});

// Shape of the columns we select for encrypt/decrypt bookkeeping. Supabase's
// untyped client returns `{}`; we own these columns so a local cast is safe.
interface SecretCryptoRow {
  dek_id: string | null;
  id: string;
  kind: string;
  owner_id: string;
  owner_scope: z.infer<typeof ownerScope>;
  payload_enc: string;
  tenant_id: string;
}

/**
 * CRUD + list operations. The audited REVEAL path is a separate HTTP route
 * (reveal-routes.ts) so decrypt is never reachable as a low-friction tool call.
 * Metadata list never returns payload_enc.
 */
export function registerSecretsOperations(
  api: PluginServerApi,
  supabase: SupabaseClient
): void {
  const db = () => supabase.schema(SCHEMA);

  api.registerOperation({
    operationId: "secrets_list",
    moduleId: "secrets",
    summary: "List secret metadata the caller is in scope for",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.secrets.read"],
    inputSchema: listInput,
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const inp = (input ?? {}) as NonNullable<z.infer<typeof listInput>>;
      // RLS clamps to tenant+scope. payload_enc excluded by column grant, but we
      // also select an explicit column list so nothing leaks even service-side.
      let q = db()
        .from("secrets")
        .select(
          "id, owner_scope, owner_id, name, kind, url, description, created_by, created_at, updated_at"
        )
        // RLS is bypassed by the service-role client, so the tenant boundary
        // must be enforced explicitly here (BUG-1). Every service-role read in
        // this module carries this filter.
        .eq("tenant_id", ctx.auth.tenantId)
        .is("deleted_at", null);
      if (inp.owner_scope) {
        q = q.eq("owner_scope", inp.owner_scope);
      }
      if (inp.owner_id) {
        q = q.eq("owner_id", inp.owner_id);
      }
      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) {
        throw new Error(`secrets_list: ${error.message}`);
      }
      return { rows: data ?? [] };
    },
  });

  api.registerOperation({
    operationId: "secrets_create",
    moduleId: "secrets",
    summary: "Create an encrypted secret",
    idempotent: false,
    riskLevel: "medium",
    requiredCapabilities: ["module.secrets.write"],
    // scope_id is NOT taken from input — it comes from ctx.auth.scopeId (the
    // principal's resolved scope), so a secret can't be planted in a foreign
    // scope. See plan R8.
    inputSchema: createInput,
    handler: async (rawInput, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const input = rawInput as z.infer<typeof createInput>;
      const { tenantId } = ctx.auth;
      const id = crypto.randomUUID();
      const { key, dekId } = await staticKeyWrapper.keyForEncrypt(tenantId);
      const payload_enc = encryptPayload(
        JSON.stringify(input.payload),
        key,
        secretAad({
          secretId: id,
          ownerScope: input.owner_scope,
          ownerId: input.owner_id,
        })
      );
      const { error } = await db()
        .from("secrets")
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: ctx.auth.scopeId,
          owner_scope: input.owner_scope,
          owner_id: input.owner_id,
          name: input.name,
          kind: input.kind,
          url: input.url ?? null,
          description: input.description ?? null,
          payload_enc,
          dek_id: dekId,
          created_by: actorUserIdFromAuth(ctx.auth),
        });
      if (error) {
        throw new Error(`secrets_create: ${error.message}`);
      }
      if (input.project_ids?.length) {
        await db()
          .from("secret_projects")
          .insert(
            input.project_ids.map((project_id) => ({
              tenant_id: tenantId,
              secret_id: id,
              project_id,
            }))
          );
      }
      return { id };
    },
  });

  api.registerOperation({
    operationId: "secrets_reveal",
    moduleId: "secrets",
    summary: "Decrypt and return a secret's payload (audited; agent-gated)",
    // Returns plaintext — highest-risk op. Agent authorization is enforced by
    // createSecretsRevealPolicy BEFORE this handler runs; for users the policy
    // abstains and this handler runs the user-scope resolve. Agent-ness comes
    // from ctx.auth.agentId (the forwarded x-engenty-agent-id identity).
    idempotent: true,
    riskLevel: "high",
    requiredCapabilities: ["module.secrets.read"],
    inputSchema: revealInput,
    handler: async (rawInput, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const input = rawInput as z.infer<typeof revealInput>;
      const { tenantId, principalId } = ctx.auth;

      const { data, error } = await db()
        .from("secrets")
        .select(
          "id, tenant_id, owner_scope, owner_id, kind, payload_enc, dek_id"
        )
        .eq("id", input.secret_id)
        .is("deleted_at", null)
        .single();
      const secret = data as SecretCryptoRow | null;
      if (error || !secret || secret.tenant_id !== tenantId) {
        throw new Error("secrets_reveal: not found");
      }

      const agentId = ctx.auth.agentId;
      const isAgent = Boolean(agentId);

      // Users: authorize here (policy abstained). Agents: already authorized by
      // createSecretsRevealPolicy (grants ∪ goal grants) before dispatch.
      if (!isAgent) {
        const principal: Principal = { kind: "user", id: principalId };
        const allowed = await canReadSecret(
          supabase,
          { tenantId, principal, secret },
          buildResolveDeps(supabase, ctx.auth)
        );
        if (!allowed) {
          throw new Error("secrets_reveal: forbidden");
        }
      }

      const key = await staticKeyWrapper.keyForDecrypt(tenantId, secret.dek_id);
      const payload = JSON.parse(
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

      await db()
        .from("access_log")
        .insert({
          tenant_id: tenantId,
          secret_id: secret.id,
          // Attribute agent reveals to the AGENT principal, not the user whose
          // bearer token the chat runs under.
          principal_id: agentId ?? principalId,
          principal_kind: isAgent ? "agent" : "user",
          action: isAgent ? "decrypt_for_agent" : "reveal",
          goal_id: ctx.auth.goalId ?? null,
        });

      return { id: secret.id, kind: secret.kind, payload };
    },
  });

  api.registerOperation({
    operationId: "secrets_update",
    moduleId: "secrets",
    summary:
      "Update a secret's metadata and/or payload (re-encrypts on payload change)",
    idempotent: false,
    riskLevel: "medium",
    requiredCapabilities: ["module.secrets.write"],
    // Owner is immutable here (use secrets_move to change it) so the AAD that
    // binds the ciphertext stays valid. Payload optional: only re-encrypt when present.
    inputSchema: updateInput,
    handler: async (rawInput, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const input = rawInput as z.infer<typeof updateInput>;
      const { tenantId } = ctx.auth;
      // Load current row (RLS + explicit tenant check) to get owner for AAD.
      const { data, error: loadErr } = await db()
        .from("secrets")
        .select("id, tenant_id, owner_scope, owner_id")
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();
      const row = data as Pick<
        SecretCryptoRow,
        "id" | "tenant_id" | "owner_scope" | "owner_id"
      > | null;
      if (loadErr || !row || row.tenant_id !== tenantId) {
        throw new Error("secrets_update: not found");
      }

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) {
        patch.name = input.name;
      }
      if (input.url !== undefined) {
        patch.url = input.url;
      }
      if (input.description !== undefined) {
        patch.description = input.description;
      }
      if (input.payload !== undefined) {
        const { key, dekId } = await staticKeyWrapper.keyForEncrypt(tenantId);
        patch.payload_enc = encryptPayload(
          JSON.stringify(input.payload),
          key,
          secretAad({
            secretId: row.id,
            ownerScope: row.owner_scope,
            ownerId: row.owner_id,
          })
        );
        patch.dek_id = dekId;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await db()
          .from("secrets")
          .update(patch)
          .eq("id", input.id);
        if (error) {
          throw new Error(`secrets_update: ${error.message}`);
        }
      }
      if (input.project_ids) {
        // Replace associations wholesale (mass-edit friendly).
        await db().from("secret_projects").delete().eq("secret_id", input.id);
        if (input.project_ids.length) {
          await db()
            .from("secret_projects")
            .insert(
              input.project_ids.map((project_id) => ({
                tenant_id: tenantId,
                secret_id: input.id,
                project_id,
              }))
            );
        }
      }
      return { id: input.id };
    },
  });

  api.registerOperation({
    operationId: "secrets_delete",
    moduleId: "secrets",
    summary: "Soft-delete a secret",
    idempotent: true,
    riskLevel: "high",
    requiredCapabilities: ["module.secrets.write"],
    inputSchema: deleteInput,
    handler: async (rawInput, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const input = rawInput as z.infer<typeof deleteInput>;
      const { error } = await db()
        .from("secrets")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("tenant_id", ctx.auth.tenantId);
      if (error) {
        throw new Error(`secrets_delete: ${error.message}`);
      }
      return { id: input.id };
    },
  });

  api.registerOperation({
    operationId: "secrets_move",
    moduleId: "secrets",
    summary:
      "Re-home a secret to a different owner (re-encrypts to the new AAD)",
    idempotent: false,
    riskLevel: "high",
    requiredCapabilities: ["module.secrets.write"],
    inputSchema: moveInput,
    handler: async (rawInput, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const input = rawInput as z.infer<typeof moveInput>;
      const { tenantId } = ctx.auth;
      const { data, error: loadErr } = await db()
        .from("secrets")
        .select("id, tenant_id, owner_scope, owner_id, payload_enc, dek_id")
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();
      const row = data as SecretCryptoRow | null;
      if (loadErr || !row || row.tenant_id !== tenantId) {
        throw new Error("secrets_move: not found");
      }
      // AAD binds ciphertext to the owner, so a move MUST decrypt with the old
      // AAD and re-encrypt with the new one. The server holds the key; plaintext
      // never leaves this handler.
      const oldKey = await staticKeyWrapper.keyForDecrypt(tenantId, row.dek_id);
      const plain = decryptPayload(
        row.payload_enc,
        oldKey,
        secretAad({
          secretId: row.id,
          ownerScope: row.owner_scope,
          ownerId: row.owner_id,
        })
      );
      const { key, dekId } = await staticKeyWrapper.keyForEncrypt(tenantId);
      const payload_enc = encryptPayload(
        plain,
        key,
        secretAad({
          secretId: row.id,
          ownerScope: input.owner_scope,
          ownerId: input.owner_id,
        })
      );
      const { error } = await db()
        .from("secrets")
        .update({
          owner_scope: input.owner_scope,
          owner_id: input.owner_id,
          payload_enc,
          dek_id: dekId,
        })
        .eq("id", input.id);
      if (error) {
        throw new Error(`secrets_move: ${error.message}`);
      }
      return { id: input.id, owner_scope: input.owner_scope };
    },
  });
}
