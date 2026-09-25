import type { ReactNode } from "react";
import { Navigate, Route, useLocation, useParams } from "react-router-dom";
import { DefaultPlaceRedirect } from "@/routes/DefaultPlaceRedirect";
import { LegacySpaceSettingsRedirect } from "@/routes/LegacySpaceSettingsRedirect";
import {
  AiGeneralSettingsPage,
  AppearanceSettingsPage,
  DevelopmentSettingsPage,
  FeatureFlagsPage,
  NotificationStreamsSettingsPage,
  PlatformSettingsPage,
  RolesSettingsPage,
  SearchIndexSettingsPage,
  SettingsPage,
  SetupPage,
  SetupPluginsPage,
  SetupStudioPage,
  SpacesSettingsPage,
  TenantIntegrationKeysPage,
  TenantSettingsPage,
} from "@/routes/lazy-admin-pages";

export interface AdminSettingsRoutesOpts {
  developerModeEnabled: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

// Where a member lands when they hit an admin-only settings page. Profile is
// always present (user-management) and personal.
const MEMBER_SETTINGS_HOME = "/settings/profile";

function RedirectPreserveSearch({ to }: { to: string }) {
  const { hash, search } = useLocation();
  return <Navigate replace to={`${to}${search}${hash}`} />;
}

function LegacyAdminUserRedirect() {
  const { id } = useParams<{ id: string }>();
  return (
    <Navigate replace to={id ? `/settings/users/${id}` : "/settings/users"} />
  );
}

export function adminSettingsRoutes({
  developerModeEnabled,
  isAdmin,
  isSuperAdmin,
}: AdminSettingsRoutesOpts): ReactNode {
  return (
    <>
      <Route
        element={
          isAdmin ? (
            <NotificationStreamsSettingsPage />
          ) : (
            <Navigate replace to={MEMBER_SETTINGS_HOME} />
          )
        }
        path="/settings/notifications"
      />
      <Route
        element={isAdmin ? <SetupPage /> : <DefaultPlaceRedirect />}
        path="/setup"
      />
      <Route
        element={isSuperAdmin ? <SetupPluginsPage /> : <DefaultPlaceRedirect />}
        path="/setup/plugins"
      />
      <Route
        element={<Navigate replace to="/setup/plugins" />}
        path="/admin/plugins"
      />
      <Route
        element={<Navigate replace to="/setup/audit-logs" />}
        path="/admin/audit-logs"
      />
      <Route
        element={<Navigate replace to="/settings/users" />}
        path="/admin/users"
      />
      <Route element={<LegacyAdminUserRedirect />} path="/admin/users/:id" />
      <Route
        element={
          isAdmin ? (
            <SettingsPage />
          ) : (
            // Members can't open the tenant-admin General page — land them on
            // their personal Profile.
            <Navigate replace to={MEMBER_SETTINGS_HOME} />
          )
        }
        path="/settings"
      />
      <Route
        element={
          isAdmin ? (
            <AiGeneralSettingsPage />
          ) : (
            <Navigate replace to={MEMBER_SETTINGS_HOME} />
          )
        }
        path="/setup/ai"
      />
      <Route
        element={<RedirectPreserveSearch to="/setup/ai" />}
        path="/settings/ai"
      />
      <Route
        element={
          isAdmin ? (
            // Tenant-wide branding (colors/fonts/sidebar) — admins only.
            // Members change their own theme/language via the user menu.
            <AppearanceSettingsPage />
          ) : (
            <Navigate replace to={MEMBER_SETTINGS_HOME} />
          )
        }
        path="/settings/appearance"
      />
      <Route
        element={<RedirectPreserveSearch to="/setup/ai?tab=usage" />}
        path="/settings/ai-usage"
      />
      <Route
        element={
          isSuperAdmin ? <RolesSettingsPage /> : <DefaultPlaceRedirect />
        }
        path="/setup/roles"
      />
      <Route
        element={<Navigate replace to="/setup/roles" />}
        path="/settings/roles"
      />
      <Route
        // Members may see the list (they work in these spaces); the page hides
        // its write affordances for them, and the API refuses them anyway.
        element={<SpacesSettingsPage />}
        path="/settings/spaces"
      />
      {/* The uuid form is a legacy deep link now — space settings live at
          `/s/<key>/settings` with the rest of the space. */}
      <Route
        element={<LegacySpaceSettingsRedirect />}
        path="/settings/spaces/:spaceId"
      />
      <Route
        element={
          isSuperAdmin ? (
            <TenantSettingsPage />
          ) : (
            <Navigate
              replace
              to={isAdmin ? "/settings" : MEMBER_SETTINGS_HOME}
            />
          )
        }
        path="/settings/tenant"
      />
      <Route
        element={
          isSuperAdmin ? <PlatformSettingsPage /> : <DefaultPlaceRedirect />
        }
        path="/setup/platform"
      />
      <Route
        element={
          isAdmin ? (
            <TenantIntegrationKeysPage />
          ) : (
            <Navigate replace to={MEMBER_SETTINGS_HOME} />
          )
        }
        path="/setup/integration-keys"
      />
      <Route
        element={<RedirectPreserveSearch to="/setup/integration-keys" />}
        path="/settings/integration-keys"
      />
      <Route
        element={
          developerModeEnabled ? (
            <DevelopmentSettingsPage />
          ) : (
            <Navigate replace to="/setup" />
          )
        }
        path="/setup/development"
      />
      <Route
        element={<RedirectPreserveSearch to="/setup/development" />}
        path="/settings/development"
      />
      <Route
        element={
          developerModeEnabled ? (
            <SetupStudioPage />
          ) : (
            <Navigate replace to="/setup" />
          )
        }
        path="/setup/studio"
      />
      <Route
        element={
          developerModeEnabled && isSuperAdmin ? (
            <FeatureFlagsPage />
          ) : (
            <DefaultPlaceRedirect />
          )
        }
        path="/setup/features"
      />
      <Route
        element={<RedirectPreserveSearch to="/setup/features" />}
        path="/settings/features"
      />
      <Route
        element={
          developerModeEnabled && isSuperAdmin ? (
            <SearchIndexSettingsPage />
          ) : (
            <DefaultPlaceRedirect />
          )
        }
        path="/setup/search-index"
      />
      <Route
        element={<RedirectPreserveSearch to="/setup/search-index" />}
        path="/settings/search-index"
      />
    </>
  );
}
