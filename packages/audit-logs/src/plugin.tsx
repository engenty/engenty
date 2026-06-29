import { DockAuditLogsIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { TenantAuditLogsPage } from "./routes/tenant-audit-logs-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerRoute({
    id: "audit_logs_tenant",
    path: "/admin/audit-logs",
    component: TenantAuditLogsPage,
    order: 210,
  });

  engenty.UI.registerAdminMenuItem({
    id: "audit_logs_menu",
    section: "admin",
    label: "Audit Logs",
    labelKey: "menu.auditLogs",
    to: "/admin/audit-logs",
    icon: DockAuditLogsIcon,
    order: 120,
  });
}
