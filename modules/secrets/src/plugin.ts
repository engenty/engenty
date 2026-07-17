import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  const supabase = server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    throw new Error(
      "Secrets module requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
    );
  }

  registerSecretsOperations(server, supabase as SupabaseClient);
  registerSecretsRevealRoutes(server, supabase as SupabaseClient);

  // R10 — agent reveal gate. Fires on secrets_reveal; abstains for humans.
  server.registerProfilePolicy(
    createSecretsRevealPolicy(supabase as SupabaseClient)
  );
};

export default registerSecretsPlugin;
