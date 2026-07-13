import { Navigate, Route, Routes } from "react-router-dom";
import { FeatureFlagsPage } from "@/pages/feature-flags/FeatureFlagsPage";
import { ModuleDetailPage } from "@/pages/modules/ModuleDetailPage";
import { ModulesListPage } from "@/pages/modules/ModulesListPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { TenantDetailPage } from "@/pages/tenants/TenantDetailPage";
import { TenantEditPage } from "@/pages/tenants/TenantEditPage";
import { TenantsListPage } from "@/pages/tenants/TenantsListPage";
import { UserDetailPage } from "@/pages/users/UserDetailPage";
import { UserEditPage } from "@/pages/users/UserEditPage";
import { UsersListPage } from "@/pages/users/UsersListPage";

export function ManageRoutes() {
  return (
    <Routes>
      <Route element={<Navigate replace to="/tenants" />} path="/" />
      <Route element={<TenantsListPage />} path="/tenants" />
      <Route element={<TenantDetailPage />} path="/tenants/:id" />
      <Route element={<TenantEditPage />} path="/tenants/:id/edit" />
      <Route element={<UsersListPage />} path="/users" />
      <Route element={<UserDetailPage />} path="/users/:id" />
      <Route element={<UserEditPage />} path="/users/:id/edit" />
      <Route element={<ModulesListPage />} path="/modules" />
      <Route element={<ModuleDetailPage />} path="/modules/:id" />
      <Route element={<FeatureFlagsPage />} path="/feature-flags" />
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
