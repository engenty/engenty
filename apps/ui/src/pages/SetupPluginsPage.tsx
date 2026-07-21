import { useEffect } from "react";
import { isManageAppEnabled, MANAGE_MODULES_HREF } from "@/lib/manage-app";
import { TenantPluginsPage } from "@/pages/TenantPluginsPage";

interface SetupPluginsPageProps {
  /** Superadmins on PRO hand off to Manage; tenant admins keep the in-app page. */
  isSuperAdmin: boolean;
}

/**
 * Setup → Plugins. On PRO builds with Manage enabled, superadmins hand off to
 * the manage SPA module registry; otherwise render the tenant plugins console.
 */
export function SetupPluginsPage({ isSuperAdmin }: SetupPluginsPageProps) {
  if (isManageAppEnabled() && isSuperAdmin) {
    return <ManageModulesHandoff />;
  }
  return <TenantPluginsPage />;
}

function ManageModulesHandoff() {
  useEffect(() => {
    window.location.replace(MANAGE_MODULES_HREF);
  }, []);
  return null;
}
