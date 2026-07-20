/**
 * Real-database integration harness for the `*.integration.test.ts` lane
 * (run via `pnpm test:integration` against the local Supabase stack).
 *
 * Lives under `src/dal/` because that is the sanctioned location for real
 * `@supabase/supabase-js` clients (see scripts/check-supabase-imports.mjs).
 *
 * Conventions for integration suites:
 * - Seed your own tenants with `seedTenants` and call the returned cleanup in
 *   `afterAll` — tenant deletion cascades through all tenant-scoped tables.
 * - Never assume pre-existing rows; the shared dev database also serves
 *   local development.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Placeholder injected by the unit-test setup — never a real credential. */
const PLACEHOLDER_SERVICE_KEYS = new Set(["test-service-role-key"]);

function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return null;
}

/**
 * Populate missing SUPABASE_* env vars from the repo-root `.env.local`
 * (developer machines). CI sets the vars explicitly and skips this.
 */
export function loadLocalSupabaseEnv(): void {
  const needed = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (name) =>
      !process.env[name] || PLACEHOLDER_SERVICE_KEYS.has(process.env[name])
  );
  if (needed.length === 0) {
    return;
  }
  const root = findRepoRoot(process.cwd());
  if (!root) {
    return;
  }
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)(.*)\2\s*$/);
    if (match && needed.includes(match[1])) {
      process.env[match[1]] = match[3];
    }
  }
}

export interface IntegrationEnv {
  serviceRoleKey: string;
  url: string;
}

/**
 * Resolve and validate the integration-database env. Throws with a clear
 * message when the local stack is not available, and refuses non-local
 * targets unless ENGENTY_INTEGRATION_ALLOW_REMOTE=1 — integration suites
 * write and delete data.
 */
export function resolveIntegrationEnv(): IntegrationEnv {
  loadLocalSupabaseEnv();
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey || PLACEHOLDER_SERVICE_KEYS.has(serviceRoleKey)) {
    throw new Error(
      "Integration lane needs a real local Supabase: start it (pnpm supabase:start && pnpm db:migrate) " +
        "and provide SUPABASE_SERVICE_ROLE_KEY (env or repo-root .env.local)."
    );
  }
  const host = new URL(url).hostname;
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  if (!isLocal && process.env.ENGENTY_INTEGRATION_ALLOW_REMOTE !== "1") {
    throw new Error(
      `Refusing to run integration tests against non-local SUPABASE_URL (${url}). ` +
        "Set ENGENTY_INTEGRATION_ALLOW_REMOTE=1 only if you really mean it."
    );
  }
  return { serviceRoleKey, url };
}

/** Service-role client for the local integration database. */
export function createIntegrationDb(): SupabaseClient {
  const { serviceRoleKey, url } = resolveIntegrationEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export interface SeedTenant {
  id: string;
  name?: string;
  slug?: string;
}

/**
 * Upsert isolated test tenants and return a cleanup that deletes them —
 * `core.tenants` deletion cascades through every tenant-scoped table.
 */
export async function seedTenants(
  db: SupabaseClient,
  tenants: SeedTenant[]
): Promise<() => Promise<void>> {
  const rows = tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name ?? `Integration ${tenant.id.slice(-4)}`,
    slug: tenant.slug ?? `integration-${tenant.id.slice(-12)}`,
  }));
  const { error } = await db
    .schema("core")
    .from("tenants")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`integration tenant setup failed: ${error.message}`);
  }
  const ids = rows.map((row) => row.id);
  return async () => {
    const { error: deleteError } = await db
      .schema("core")
      .from("tenants")
      .delete()
      .in("id", ids);
    if (deleteError) {
      throw new Error(
        `integration tenant cleanup failed: ${deleteError.message}`
      );
    }
  };
}

export interface SeedUser {
  display_name?: string;
  email?: string;
  id: string;
  tenant_id: string;
}

/** Upsert users for seeded tenants (cleaned up by the tenant cascade). */
export async function seedUsers(
  db: SupabaseClient,
  users: SeedUser[]
): Promise<void> {
  const rows = users.map((user) => ({
    display_name: user.display_name ?? "Integration User",
    email: user.email ?? `integration-${user.id.slice(-12)}@example.test`,
    id: user.id,
    tenant_id: user.tenant_id,
  }));
  const { error } = await db
    .schema("core")
    .from("users")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`integration user setup failed: ${error.message}`);
  }
}
