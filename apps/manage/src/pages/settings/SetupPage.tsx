import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { PlatformSettingsPanel } from "@/features/platform-settings/platform-settings-panel";

/**
 * Same surface as UI `/setup/platform` — installation-wide keys and credentials —
 * hosted under manage Settings so operators can configure them from the meta console.
 */
export function SetupPage() {
  const { t } = useTranslation("common");
  const title = t("settings.setup.menuLabel");
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
          <p className="text-muted-foreground text-sm">
            {t("settings.setup.intro")}
          </p>
        </div>
        <PlatformSettingsPanel />
      </div>
    </div>
  );
}
