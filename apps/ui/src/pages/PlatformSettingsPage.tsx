// Platform settings (/setup/platform, superadmin): installation-wide keys and
// credentials — AI provider keys, connector OAuth clients, channel tokens,
// ingest keys — with environment variables as the fallback. The same panel,
// scoped to "tenant", backs the tenant-admin integration-keys page.

import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { PlatformSettingsPanel } from "@/features/platform-settings/platform-settings-panel";

function PlatformSettingsPageInner({
  scope,
  title,
  intro,
}: {
  scope: "platform" | "tenant";
  title: string;
  intro: string;
}) {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));

  const breadcrumbs = useMemo(
    () => [...(moduleRootCrumb ? [moduleRootCrumb] : []), { label: title }],
    [moduleRootCrumb, title]
  );

  usePageConfig({
    breadcrumbs,
    topbarChrome: "contentBlend",
    secondaryNavHeaderSlot,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
        <div className="space-y-1">
          <h1 className="font-semibold text-xl">{title}</h1>
          <p className="text-muted-foreground text-sm">{intro}</p>
        </div>
        <PlatformSettingsPanel scope={scope} />
      </div>
    </div>
  );
}

export function PlatformSettingsPage() {
  return (
    <PlatformSettingsPageInner
      intro="Installation-wide keys and credentials. Values set here override the corresponding environment variables for every tenant. Secrets are stored encrypted and never shown again."
      scope="platform"
      title="Platform settings"
    />
  );
}

export function TenantIntegrationKeysPage() {
  return (
    <PlatformSettingsPageInner
      intro="Override integration credentials for your tenant — for example, connect with your own OAuth app or bot token. Leave a field blank to use the platform default."
      scope="tenant"
      title="Integration keys"
    />
  );
}
