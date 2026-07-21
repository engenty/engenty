/**
 * Build-time handoff to the closed Manage SPA (`apps/manage`).
 *
 * PRO installs that ship Manage set `VITE_MANAGE_APP_ENABLED=true` on the UI
 * build so Setup → Plugins leaves the tenant app for `/manage/modules`.
 * Open builds leave the flag unset and keep the in-app `/setup/plugins` page.
 */
export const MANAGE_MODULES_HREF = "/manage/modules";

export function isManageAppEnabled(): boolean {
  return import.meta.env.VITE_MANAGE_APP_ENABLED === "true";
}
