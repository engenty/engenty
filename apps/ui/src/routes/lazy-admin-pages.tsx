/**
 * Infrequent admin/settings pages. React.lazy keeps them out of the initial
 * graph; core shell and `/s/:spaceKey/*` stay eager in AuthenticatedRoutes.
 */
import { Spinner } from "@engenty/ui-core";
import { type ComponentType, createElement, lazy, Suspense } from "react";

function AdminRouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-page">
      <Spinner />
    </div>
  );
}

function lazyPage<ExportName extends string>(
  loader: () => Promise<Record<ExportName, ComponentType>>,
  exportName: ExportName
): ComponentType {
  const Page = lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] };
  });
  function LazyAdminPage() {
    return createElement(
      Suspense,
      { fallback: createElement(AdminRouteFallback) },
      createElement(Page)
    );
  }
  LazyAdminPage.displayName = `Lazy(${exportName})`;
  return LazyAdminPage;
}

export const AppearanceSettingsPage = lazyPage(
  () => import("@/pages/AppearanceSettingsPage"),
  "AppearanceSettingsPage"
);
export const DevelopmentSettingsPage = lazyPage(
  () => import("@/pages/DevelopmentSettingsPage"),
  "DevelopmentSettingsPage"
);
export const FeatureFlagsPage = lazyPage(
  () => import("@/pages/FeatureFlagsPage"),
  "FeatureFlagsPage"
);
export const PlatformSettingsPage = lazyPage(
  () => import("@/pages/PlatformSettingsPage"),
  "PlatformSettingsPage"
);
export const RolesSettingsPage = lazyPage(
  () => import("@/pages/RolesSettingsPage"),
  "RolesSettingsPage"
);
export const SearchIndexSettingsPage = lazyPage(
  () => import("@/pages/SearchIndexSettingsPage"),
  "SearchIndexSettingsPage"
);
export const SettingsPage = lazyPage(
  () => import("@/pages/SettingsPage"),
  "SettingsPage"
);
export const SetupPage = lazyPage(
  () => import("@/pages/SetupPage"),
  "SetupPage"
);
export const SetupPluginsPage = lazyPage(
  () => import("@/pages/SetupPluginsPage"),
  "SetupPluginsPage"
);
export const SetupStudioPage = lazyPage(
  () => import("@/pages/SetupStudioPage"),
  "SetupStudioPage"
);
export const SpacesSettingsPage = lazyPage(
  () => import("@/pages/SpacesSettingsPage"),
  "SpacesSettingsPage"
);
export const TenantIntegrationKeysPage = lazyPage(
  () => import("@/pages/PlatformSettingsPage"),
  "TenantIntegrationKeysPage"
);
export const TenantSettingsPage = lazyPage(
  () => import("@/pages/TenantSettingsPage"),
  "TenantSettingsPage"
);
export const AiGeneralSettingsPage = lazyPage(
  () => import("@engenty/ai-ui"),
  "AiGeneralSettingsPage"
);
export const NotificationStreamsSettingsPage = lazyPage(
  () => import("@engenty/notifications-ui"),
  "NotificationStreamsSettingsPage"
);
