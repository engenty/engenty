import { createClient } from "@supabase/supabase-js";
import { createSupabaseIdentityAdminAdapter } from "../../identity/supabase-identity-admin-adapter.js";
import { resolveSupabaseConfig } from "../supabase-config.js";
import {
  getTenantIdForAuthUser,
  isAuthUserAdmin,
  isAuthUserSuperAdmin,
  resolveAuthUser,
} from "./auth.js";
import {
  createUserInTenant,
  deleteUser,
  getUserById,
  listUserDirectory,
  listUsers,
  updateUser,
  updateUserPassword,
} from "./crud.js";
import {
  createInitialAdmin,
  ensureCurrentAuthUser,
  getSetupStatus,
  initializeAdminForAuthUser,
} from "./setup.js";
import type { CoreUsersDal } from "./types.js";
import {
  getServiceWorkspaceContext,
  getWorkspaceContext,
} from "./workspace.js";

/**
 * Creates a tenant-scoped core users DAL backed by a Supabase service-role client.
 * Uses an anon client for user JWT verification (getUser) — the standard pattern
 * for validating user session tokens on the server.
 */
export function createCoreUsersDal(
  config: Record<string, unknown>
): CoreUsersDal {
  const { url, serviceRoleKey, anonKey } = resolveSupabaseConfig(config);
  if (!anonKey) {
    throw new Error(
      "Missing Supabase anon/publishable key (SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY, or VITE_SUPABASE_ANON_KEY). Required for user JWT verification."
    );
  }
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authConfig = { anonKey, url };
  const identityAdmin = createSupabaseIdentityAdminAdapter(client);

  return {
    getSetupStatus: () => getSetupStatus(client),
    resolveAuthUser: (token) => resolveAuthUser(client, token, authConfig),
    getTenantIdForAuthUser: (token) =>
      getTenantIdForAuthUser(client, token, authConfig),
    ensureCurrentAuthUser: (token) =>
      ensureCurrentAuthUser(client, token, identityAdmin, authConfig),
    getWorkspaceContext: (token) =>
      getWorkspaceContext(client, token, authConfig),
    getServiceWorkspaceContext: (serviceParams) =>
      getServiceWorkspaceContext(client, serviceParams),
    initializeAdminForAuthUser: (token) =>
      initializeAdminForAuthUser(client, token, identityAdmin, authConfig),
    createInitialAdmin: (input) =>
      createInitialAdmin(client, input, identityAdmin),
    isAuthUserAdmin: (token) => isAuthUserAdmin(client, token, authConfig),
    isAuthUserSuperAdmin: (token) =>
      isAuthUserSuperAdmin(client, token, authConfig),
    listUserDirectory: (tenantId) => listUserDirectory(client, tenantId),
    listUsers: (tenantId) => listUsers(client, tenantId),
    getUserById: (id, tenantId) => getUserById(client, id, tenantId),
    updateUser: (id, tenantId, patch) =>
      updateUser(client, id, tenantId, patch),
    createUser: (tenantId, input) =>
      createUserInTenant(client, tenantId, input, identityAdmin),
    deleteUser: (id, tenantId) =>
      deleteUser(client, id, tenantId, identityAdmin),
    updateUserPassword: (id, tenantId, pwd) =>
      updateUserPassword(client, id, tenantId, pwd, identityAdmin),
  };
}

// Re-export types and factory for consumers
export type {
  CoreUser,
  CoreUsersDal,
  GlobalRole,
  InviteUserInput,
  TenantRole,
  WorkspaceContextResult,
} from "./types.js";
