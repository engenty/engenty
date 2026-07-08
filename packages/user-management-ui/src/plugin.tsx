import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  registerUserManagementListColumn,
  registerUserManagementListEnricher,
  resetUserManagementListHooks,
} from "./list-hooks.js";
import { ProfileSettingsPage } from "./routes/profile-settings-page.js";
import { UserEditPage } from "./routes/user-edit-page.js";
import { UsersListPage } from "./routes/users-list-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  resetUserManagementListHooks();
  engenty.plugins.expose({
    registerListColumn: registerUserManagementListColumn,
    registerListEnricher: registerUserManagementListEnricher,
  });

  // Canonical routes
  engenty.UI.registerRoute({
    id: "user_management_users",
    path: "/admin/users",
    component: UsersListPage,
    order: 200,
  });

  engenty.UI.registerRoute({
    id: "user_management_users_detail",
    path: "/admin/users/:id",
    component: UserEditPage,
    order: 201,
  });

  engenty.UI.registerRoute({
    id: "user_management_profile",
    path: "/settings/profile",
    component: ProfileSettingsPage,
    order: 204,
  });

  engenty.UI.registerSettingsItem({
    id: "user_management_settings_profile",
    label: "Profile",
    labelKey: "menu.profile",
    to: "/settings/profile",
    order: 200,
  });
}
