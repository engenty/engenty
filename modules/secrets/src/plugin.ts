import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerSecretsImportRoutes } from "./api/import-routes.js";
import { registerSecretsOperations } from "./api/operations.js";
import { registerSecretsRevealRoutes } from "./api/reveal-routes.js";
import { createSecretsRevealPolicy } from "./policy.js";

/**
 * Secrets Vault module (core face). Owns the vault schema, server-side
 * encryption, CRUD operations, and the audited reveal path. Agents read via
 * secret_grants (durable) or a goal grant (ephemeral); the agent reveal gate is
 * createSecretsRevealPolicy (R10). See docs/wip/secrets-vault-module.md.
 */
const registerSecretsPlugin: EngentyPluginFactory = (engenty) => {
  // Module role bundles (assignable to users/agents), mirroring connections.
  // NOTE (R2): module.secrets.read is covered by tenant.member's module.* —
  // plaintext reveal is therefore gated by owner_scope membership in resolve.ts,
  // NOT by this capability alone.
  engenty.server.registerRoleProfiles([
    {
      id: "secrets.viewer",
      title: "Secrets viewer",
      capabilities: ["module.secrets.read"],
    },
    {
      id: "secrets.editor",
      title: "Secrets editor",
      capabilities: ["module.secrets.read", "module.secrets.write"],
    },
  ]);

  const { server } = engenty;
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). Every secrets lane
  // (operations, reveal routes, the agent reveal policy) carries auth/tenantId at
  // call time, so the service-role client is not captured at all. The explicit
  // `.eq("tenant_id", …)` filters in the handlers stay as the belt; RLS is the wall.
  const getTenantDb = server.getTenantDb;
  if (!getTenantDb) {
    throw new Error(
      "Secrets module requires tenant-locked DB handles (server.getTenantDb)"
    );
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  registerSecretsOperations(server, getDb);
  registerSecretsRevealRoutes(server, getDb);
  registerSecretsImportRoutes(server);

  // R10 — agent reveal gate. Fires on secrets_reveal; abstains for humans.
  server.registerProfilePolicy(createSecretsRevealPolicy(getDb));
};

export default registerSecretsPlugin;
