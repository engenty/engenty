import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import {
  GeneralTenantSettingsSection,
  TenantAppearanceSettingsSection,
  TenantPluginsSettingsSection,
  TenantUsersSettingsSection,
} from "@/components/settings";

export function SettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));

  usePageConfig({
    breadcrumbs: useMemo(
      () => (moduleRootCrumb ? [moduleRootCrumb] : []),
      [moduleRootCrumb]
    ),
    secondaryNavHeaderSlot,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto bg-muted/20">
      <div className="mx-auto w-full max-w-4xl space-y-8 p-page sm:pt-4">
        {/* Core Tenant Settings (Centered Identity) */}
        <GeneralTenantSettingsSection />

        {/* Stacked Layout: Users → Appearance → Plugins */}
        <div className="space-y-8 pb-12">
          <TenantUsersSettingsSection />
          <TenantAppearanceSettingsSection />
          <TenantPluginsSettingsSection />
        </div>
      </div>
    </div>
  );
}
