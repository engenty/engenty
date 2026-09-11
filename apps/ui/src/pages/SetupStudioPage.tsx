import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { MastraStudioDevSection } from "@engenty/user-management-ui";
import { useMemo } from "react";

export function SetupStudioPage() {
  const { t } = useTranslation("common");
  const { session } = useCoreAuthSession();
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );
  const accessToken = session?.access_token;

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("navigation.mastraStudio") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto bg-muted/20">
      <div className="mx-auto w-full max-w-4xl space-y-8 p-page sm:pt-4">
        <SettingsFormSection
          cardClassName="space-y-3"
          cardVariant="compact"
          description={t("authSection.mastraStudioDescription")}
          title={t("navigation.mastraStudio")}
        >
          {accessToken ? (
            <MastraStudioDevSection accessToken={accessToken} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("authSection.mastraStudioNeedSession")}
            </p>
          )}
        </SettingsFormSection>
      </div>
    </div>
  );
}
