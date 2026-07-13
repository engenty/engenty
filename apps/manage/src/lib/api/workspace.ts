import { request } from "./http";

export interface WorkspaceTenant {
  id: string;
  name: string;
  slug: string;
}

export interface WorkspaceContextResponse {
  canSwitchTenant: boolean;
  currentTenant: WorkspaceTenant | null;
  currentUser: {
    display_name: string | null;
    email: string | null;
    id: string;
    initials: string | null;
    role: "admin" | "member" | null;
  };
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  onboarded: boolean;
  tenantRole: "admin" | "member" | null;
  tenants: WorkspaceTenant[];
  userId: string;
}

export function getWorkspaceContext(signal?: AbortSignal) {
  return request<WorkspaceContextResponse>("/api/users/setup/context", {
    signal,
  });
}
