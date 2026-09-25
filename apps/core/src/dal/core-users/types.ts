export interface CoreUser {
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
  initials: string | null;
  is_super_admin: boolean;
  phone: string | null;
  role: "admin" | "member";
  tenant_id: string;
  updated_at: string;
}

export type TenantRole = "admin" | "member";
export type GlobalRole = "superadmin";

export interface InviteUserInput {
  display_name: string;
  email: string;
  password: string;
  phone?: string;
  role: TenantRole;
}

import type { User } from "@supabase/supabase-js";

/**
 * What `/api/users/setup/context` answers. `tenantRole` widens past
 * {@link TenantRole} because a service principal holds no membership row —
 * see the note on `WorkspaceContext.tenantRole` in workspace.ts.
 */
export interface WorkspaceContextResult {
  canSwitchTenant: boolean;
  /** See {@link WorkspaceContext.capabilities} in workspace.ts. */
  capabilities: string[];
  currentTenant: { id: string; slug: string; name: string } | null;
  currentUser: {
    display_name: string | null;
    email: string | null;
    id: string;
    initials: string | null;
    role: TenantRole | null;
  };
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  onboarded: boolean;
  /** Commercial package label, or "local" when none is assigned. */
  planLabel: string;
  resolvedAppearance: {
    font: string;
    fontSize: string;
    /** Unset when nobody chose one — the browser's language stands. */
    language?: string;
    themeMode: string;
  };
  tenantRole: TenantRole | "service" | null;
  tenantSupportedLocales: string[];
  tenants: Array<{ id: string; slug: string; name: string }>;
  userId: string;
}

export interface CoreUsersDal {
  createInitialAdmin: (input: {
    email: string;
    password: string;
    display_name: string;
  }) => Promise<{ user: CoreUser }>;
  createUser: (tenantId: string, input: InviteUserInput) => Promise<CoreUser>;
  deleteUser: (id: string, tenantId: string) => Promise<void>;
  ensureCurrentAuthUser: (
    accessToken: string
  ) => Promise<{ user: CoreUser; created: boolean }>;
  getServiceWorkspaceContext: (params: {
    capabilities: string[];
    principalId: string;
    tenantId: string;
  }) => Promise<WorkspaceContextResult>;
  getSetupStatus: () => Promise<{
    initialSetupRequired: boolean;
    usersCount: number;
  }>;
  getTenantIdForAuthUser: (accessToken: string) => Promise<string | null>;
  getUserById: (id: string, tenantId: string) => Promise<CoreUser | null>;
  getWorkspaceContext: (accessToken: string) => Promise<WorkspaceContextResult>;
  initializeAdminForAuthUser: (
    accessToken: string
  ) => Promise<{ user: CoreUser }>;
  isAuthUserAdmin: (accessToken: string) => Promise<boolean>;
  isAuthUserSuperAdmin: (accessToken: string) => Promise<boolean>;
  /** Names + ids only — the member-facing picker source. See `listUsers` for the full rows. */
  listUserDirectory: (
    tenantId: string
  ) => Promise<
    Array<{ displayName: string | null; email: string; id: string }>
  >;
  listUsers: (tenantId: string) => Promise<CoreUser[]>;
  resolveAuthUser: (accessToken: string) => Promise<User>;
  updateUser: (
    id: string,
    tenantId: string,
    patch: Partial<
      Omit<CoreUser, "id" | "tenant_id" | "created_at" | "updated_at">
    >
  ) => Promise<CoreUser>;
  updateUserPassword: (
    id: string,
    tenantId: string,
    newPassword: string
  ) => Promise<void>;
}
