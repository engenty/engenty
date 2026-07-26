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
  getSetupStatus: () => Promise<{
    initialSetupRequired: boolean;
    usersCount: number;
  }>;
  getTenantIdForAuthUser: (accessToken: string) => Promise<string | null>;
  getUserById: (id: string, tenantId: string) => Promise<CoreUser | null>;
  getWorkspaceContext: (accessToken: string) => Promise<{
    onboarded: boolean;
    userId: string;
    currentUser: {
      id: string;
      email: string | null;
      display_name: string | null;
      initials: string | null;
      role: TenantRole | null;
    };
    isSuperAdmin: boolean;
    isTenantAdmin: boolean;
    currentTenant: { id: string; slug: string; name: string } | null;
    tenants: Array<{ id: string; slug: string; name: string }>;
    canSwitchTenant: boolean;
    /** Commercial package label, or "local" when none is assigned. */
    planLabel: string;
    resolvedAppearance: {
      font: string;
      fontSize: string;
      language: string;
      themeMode: string;
    };
    tenantRole: TenantRole | null;
    tenantSupportedLocales: string[];
  }>;
  initializeAdminForAuthUser: (
    accessToken: string
  ) => Promise<{ user: CoreUser }>;
  isAuthUserAdmin: (accessToken: string) => Promise<boolean>;
  isAuthUserSuperAdmin: (accessToken: string) => Promise<boolean>;
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
