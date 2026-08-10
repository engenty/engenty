import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { TenantAuditLogsPage } from "./routes/tenant-audit-logs-page.js";

/** Install-owner setup area (platform-wide ops; not tenant Settings). */
export const AUDIT_LOGS_PATH = "/setup/audit-logs";
/** Former admin-rail URL — keep a redirect for bookmarks. */
export const AUDIT_LOGS_LEGACY_PATH = "/admin/audit-logs";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerRoute({
    id: "audit_logs_tenant",
    path: AUDIT_LOGS_PATH,
    component: TenantAuditLogsPage,
    order: 210,
  });
}
