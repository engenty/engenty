import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Tabs, TabsList, TabsTrigger } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  TEAM_GLOBAL_SETTINGS_FIELDS_PATH,
  TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH,
} from "../team-paths.js";

const FIELDS_TAB = "fields";
const TAXONOMIES_TAB = "taxonomies";

/**
 * Team tenant settings (fields + taxonomies): blended topbar via `usePageConfig`,
 * line tabs in a sticky paper header aligned with content (see kb-settings).
 */
export function TeamGlobalSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation("team");
  const { pathname } = useLocation();
  const activeTab = pathname.startsWith(TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH)
    ? TAXONOMIES_TAB
    : FIELDS_TAB;

  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("globalSettings.breadcrumb_settings"));

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
    breadcrumbs: [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("globalSettings.page_title") },
    ],
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        value={activeTab}
      >
        <header className="sticky top-0 z-10 w-full shrink-0 bg-paper">
          <div className="p-page pt-3 pb-0">
            <div className="mx-auto flex w-full max-w-4xl flex-col border-border border-b">
              <div className="flex items-end">
                <TabsList
                  className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
                  variant="line"
                >
                  <TabsTrigger asChild value={FIELDS_TAB}>
                    <Link to={TEAM_GLOBAL_SETTINGS_FIELDS_PATH}>
                      {t("globalSettings.tabs.fields")}
                    </Link>
                  </TabsTrigger>
                  <TabsTrigger asChild value={TAXONOMIES_TAB}>
                    <Link to={TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH}>
                      {t("globalSettings.tabs.taxonomies")}
                    </Link>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
          <div className="mx-auto w-full max-w-4xl space-y-6">{children}</div>
        </div>
      </Tabs>
    </section>
  );
}
