import { TenantPluginsPage } from "@/pages/TenantPluginsPage";

/**
 * Setup → Plugins. Kept in the tenant app for superadmins (including PRO builds
 * that ship Manage). Forced handoff to `/manage/modules` is deferred — Manage
 * remains reachable directly at `/manage/`.
 */
export function SetupPluginsPage() {
  return <TenantPluginsPage />;
}
