import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  registerUserManagementListColumn,
  registerUserManagementListEnricher,
  resetUserManagementListHooks,
} from "./list-hooks.js";
import { ProfileSettingsPage } from "./routes/profile-settings-page.js";
import { UserEditPage } from "./routes/user-edit-page.js";
import { UsersListPage } from "./routes/users-list-page.js";
import { USERS_PATH } from "./users-paths.js";

export { USERS_LEGACY_PATH, USERS_PATH } from "./users-paths.js";

export default function plugin(engenty: EngentyPluginContext) {
  resetUserManagementListHooks();
  engenty.plugins.expose({
    registerListColumn: registerUserManagementListColumn,
    registerListEnricher: registerUserManagementListEnricher,
  });

  engenty.UI.registerRoute({
    id: "user_management_users",
    path: USERS_PATH,
    component: UsersListPage,
    order: 200,
  });

  engenty.UI.registerRoute({
    id: "user_management_users_detail",
    path: `${USERS_PATH}/:id`,
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
