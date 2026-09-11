import { refreshSupabaseAuthSession } from "@engenty/auth-ui";
import type { QueryClient } from "@engenty/query-client";
import { toast } from "sonner";
import { switchCurrentTenant } from "@/lib/api/client";

/**
 * Superadmin tenant hop: switch the session, refresh auth, then drop cached
 * tenant-scoped queries so the shell reloads against the new tenant.
 */
export async function switchWorkspaceTenant(
  tenantId: string,
  queryClient: QueryClient,
  sessionRefreshFailedMessage: string
): Promise<void> {
  await switchCurrentTenant(tenantId);
  try {
    await refreshSupabaseAuthSession();
  } catch {
    toast.error(sessionRefreshFailedMessage);
  }
  await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
  await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  await queryClient.invalidateQueries({
    queryKey: ["engenty-copilot", "agent-sessions"],
  });
}
