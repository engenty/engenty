import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import {
  GeneralTenantSettingsSection,
  TenantPluginsSettingsSection,
  TenantUsersSettingsSection,
} from "@/components/settings";

export function SettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));

  const breadcrumbs = useMemo(
    () => (moduleRootCrumb ? [moduleRootCrumb] : []),
    [moduleRootCrumb]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-4xl space-y-12 p-page">
        {/* Core Tenant Settings (Centered Identity) */}
        <GeneralTenantSettingsSection />

        {/* Stacked Layout: Users then Plugins */}
        <div className="space-y-12">
          <TenantUsersSettingsSection />
          <TenantPluginsSettingsSection />
        </div>
      </div>
    </div>
  );
}
