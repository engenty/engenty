import { createContext, type ReactNode, useContext } from "react";

export interface WorkspaceTenant {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceContextValue {
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

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  children: ReactNode;
  currentTenant: WorkspaceTenant | null;
  currentUserId?: string | null;
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
}

export function WorkspaceProvider({
  children,
  currentTenant,
  currentUserId = null,
  isSuperAdmin = false,
  isTenantAdmin = false,
}: WorkspaceProviderProps) {
  const value: WorkspaceContextValue = {
    currentTenant,
    currentUserId: currentUserId ?? null,
    isSuperAdmin,
    isTenantAdmin,
  };
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    // Default to NOT admin: a module rendering outside a provider should hide
    // admin-only affordances rather than offer a dead end.
    return {
      currentTenant: null,
      currentUserId: null,
      isSuperAdmin: false,
      isTenantAdmin: false,
    };
  }
  return context;
}

/** Convenience: may this user reach tenant-config surfaces under /settings/*? */
export function useCanAdministerTenant(): boolean {
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  return isSuperAdmin || isTenantAdmin;
}
