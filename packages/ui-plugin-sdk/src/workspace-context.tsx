import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface WorkspaceTenant {
  id: string;
  name: string;
  slug: string;
}

/**
 * The space the user is currently working in — the steady container above
 * Project (PLAN-spaces.md). Until the rail lets a user switch spaces, this is
 * the tenant's default (Company) space.
 *
 * Modules need it because space-scoped storage prefixes are
 * `tenants/<t>/spaces/<s>/…`: a UI that builds a workspace path without it
 * would link into the pre-space tenant root and 404.
 */
export interface WorkspaceSpace {
  id: string;
  key: string;
  name: string;
}

/** Tenant, user, and admin flags — stable across space switches. */
export interface WorkspaceTenantState {
  currentTenant: WorkspaceTenant | null;
  /** Engenty `core.users` id (from workspace context); null when unknown. */
  currentUserId: string | null;
  /**
   * Whether the signed-in user administers this tenant, or the platform.
   *
   * Modules need this to avoid offering actions the router will refuse: every
   * plugin route under `/settings/` outside the personal allowlist is
   * admin-only (see AuthenticatedRoutes), and a blocked route redirects
   * SILENTLY to the copilot. Without this flag a module can only guess, and
   * the KB hub guessed wrong — it showed every member a "create a knowledge
   * base" button that teleported them to the chat with no explanation.
   *
   * This is a HINT for rendering, not a security boundary: the route guard and
   * the server-side capability checks remain the enforcement points.
   */
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

export interface WorkspaceContextValue extends WorkspaceTenantState {
  currentSpace: WorkspaceSpace | null;
}

const WORKSPACE_TENANT_FALLBACK: WorkspaceTenantState = {
  currentTenant: null,
  currentUserId: null,
  isSuperAdmin: false,
  isTenantAdmin: false,
};

const WorkspaceTenantContext = createContext<WorkspaceTenantState>(
  WORKSPACE_TENANT_FALLBACK
);
const WorkspaceSpaceContext = createContext<WorkspaceSpace | null>(null);

export interface WorkspaceProviderProps {
  children: ReactNode;
  currentSpace?: WorkspaceSpace | null;
  currentTenant: WorkspaceTenant | null;
  currentUserId?: string | null;
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
}

export function WorkspaceProvider({
  children,
  currentSpace = null,
  currentTenant,
  currentUserId = null,
  isSuperAdmin = false,
  isTenantAdmin = false,
}: WorkspaceProviderProps) {
  const tenantId = currentTenant?.id ?? null;
  const tenantName = currentTenant?.name ?? null;
  const tenantSlug = currentTenant?.slug ?? null;
  const tenant = useMemo((): WorkspaceTenant | null => {
    if (!(tenantId && tenantName != null && tenantSlug != null)) {
      return null;
    }
    return { id: tenantId, name: tenantName, slug: tenantSlug };
  }, [tenantId, tenantName, tenantSlug]);

  const tenantValue = useMemo(
    (): WorkspaceTenantState => ({
      currentTenant: tenant,
      currentUserId: currentUserId ?? null,
      isSuperAdmin,
      isTenantAdmin,
    }),
    [currentUserId, isSuperAdmin, isTenantAdmin, tenant]
  );

  const spaceId = currentSpace?.id ?? null;
  const spaceKey = currentSpace?.key ?? null;
  const spaceName = currentSpace?.name ?? null;
  const spaceValue = useMemo((): WorkspaceSpace | null => {
    if (!(spaceId && spaceKey != null && spaceName != null)) {
      return null;
    }
    return { id: spaceId, key: spaceKey, name: spaceName };
  }, [spaceId, spaceKey, spaceName]);

  return (
    <WorkspaceTenantContext.Provider value={tenantValue}>
      <WorkspaceSpaceContext.Provider value={spaceValue}>
        {children}
      </WorkspaceSpaceContext.Provider>
    </WorkspaceTenantContext.Provider>
  );
}

/** Tenant + admin flags only. Does not re-render when the route space changes. */
export function useWorkspaceTenant(): WorkspaceTenantState {
  return useContext(WorkspaceTenantContext);
}

/** Route space only. Re-renders when the user switches spaces. */
export function useWorkspaceSpace(): WorkspaceSpace | null {
  return useContext(WorkspaceSpaceContext);
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const tenant = useWorkspaceTenant();
  const currentSpace = useWorkspaceSpace();
  return useMemo(() => ({ ...tenant, currentSpace }), [currentSpace, tenant]);
}

/** Convenience: may this user reach tenant-config surfaces under /settings/*? */
export function useCanAdministerTenant(): boolean {
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceTenant();
  return isSuperAdmin || isTenantAdmin;
}
