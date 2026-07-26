import { Navigate, Route, Routes } from "react-router-dom";
import { AiModelPricingHistoryPage } from "@/pages/ai-models/AiModelPricingHistoryPage";
import { AiModelsPage } from "@/pages/ai-models/AiModelsPage";
import { ApprovalsPage } from "@/pages/approvals/ApprovalsPage";
import { AuditPage } from "@/pages/audit/AuditPage";
import { FeatureFlagsPage } from "@/pages/feature-flags/FeatureFlagsPage";
import { LogsPage } from "@/pages/log-inspector/LogsPage";
import { ModuleDetailPage } from "@/pages/modules/ModuleDetailPage";
import { ModulesListPage } from "@/pages/modules/ModulesListPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PackageDetailPage } from "@/pages/packages/PackageDetailPage";
import { PackagesListPage } from "@/pages/packages/PackagesListPage";
import { SatellitesListPage } from "@/pages/satellites/SatellitesListPage";
import { SearchIndexPage } from "@/pages/search-index/SearchIndexPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { SetupPage } from "@/pages/settings/SetupPage";
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
      <Route element={<PackagesListPage />} path="/packages" />
      <Route element={<PackageDetailPage />} path="/packages/:id" />
      <Route element={<SatellitesListPage />} path="/satellites" />
      <Route element={<LogsPage />} path="/logs" />
      <Route element={<AuditPage />} path="/audit" />
      <Route element={<ApprovalsPage />} path="/approvals" />
      <Route
        element={<Navigate replace to="/settings/environment" />}
        path="/settings"
      />
      <Route element={<SettingsPage />} path="/settings/environment" />
      <Route element={<SetupPage />} path="/settings/setup" />
      <Route element={<SearchIndexPage />} path="/search-index" />
      <Route element={<AiModelsPage />} path="/ai-models" />
      <Route
        element={<AiModelPricingHistoryPage />}
        path="/ai-models/pricing-history"
      />
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
