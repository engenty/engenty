import { request } from "../../lib/admin/request";
import {
  ADMIN_AGENTS_SIDEBAR_NAV_USER_SETTING_NAME,
  type AdminAgentsSidebarNavStateV1,
} from "./admin-agents-sidebar-nav-state";

export interface UserSettingHttpResponse {
  name: string;
  type: "boolean" | "json" | "numeric" | "string";
  value: boolean | number | Record<string, unknown> | string | null;
}

export async function fetchAdminAgentsSidebarNavUserSetting(
  signal?: AbortSignal
): Promise<UserSettingHttpResponse> {
  return request<UserSettingHttpResponse>(
    `/api/user-settings/${encodeURIComponent(ADMIN_AGENTS_SIDEBAR_NAV_USER_SETTING_NAME)}`,
    { signal }
  );
}

export async function saveAdminAgentsSidebarNavUserSetting(
  state: AdminAgentsSidebarNavStateV1
): Promise<UserSettingHttpResponse> {
  return request<UserSettingHttpResponse>(
    `/api/user-settings/${encodeURIComponent(ADMIN_AGENTS_SIDEBAR_NAV_USER_SETTING_NAME)}`,
    {
      body: {
        type: "json",
        value_jsonb: state,
      },
      method: "PATCH",
    }
  );
}
