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
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  children: ReactNode;
  currentTenant: WorkspaceTenant | null;
  currentUserId?: string | null;
}

export function WorkspaceProvider({
  children,
  currentTenant,
  currentUserId = null,
}: WorkspaceProviderProps) {
  const value: WorkspaceContextValue = {
    currentTenant,
    currentUserId: currentUserId ?? null,
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
    return { currentTenant: null, currentUserId: null };
  }
  return context;
}
