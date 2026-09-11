// Superadmin search-index console (/settings/search-index): health/state of
// every registered index, KB parameter editing, and an ad-hoc test-search
// bench. Diagnostics into *how* retrieval works, not an end-user search UI.

import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchIndexOverviewTab } from "@/features/search-index-admin/search-index-overview-tab";
import { SearchIndexParametersTab } from "@/features/search-index-admin/search-index-parameters-tab";
import { SearchIndexTestSearchTab } from "@/features/search-index-admin/search-index-test-search-tab";

const DEFAULT_TAB = "overview";
const PARAMETERS_TAB = "parameters";
const TEST_TAB = "test";
const VALID_TABS = new Set([DEFAULT_TAB, PARAMETERS_TAB, TEST_TAB]);

export function SearchIndexSettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const resolvedTab =
    tabParam && VALID_TABS.has(tabParam) ? tabParam : DEFAULT_TAB;

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings.searchIndex.title") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  const handleTabChange = (next: string) => {
    if (!VALID_TABS.has(next) || next === resolvedTab) {
      return;
    }
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <Tabs
        className="flex w-full flex-col gap-0"
        onValueChange={handleTabChange}
        value={resolvedTab}
      >
        <header className="w-full shrink-0 border-b bg-muted/30">
          <div className="mx-auto flex max-w-4xl items-end px-4 pt-3 pb-0 md:px-5">
            <TabsList
              className="-mb-px w-fit border-0 bg-transparent p-0"
              variant="line"
            >
              <TabsTrigger value={DEFAULT_TAB}>
                {t("settings.searchIndex.tabs.overview")}
              </TabsTrigger>
              <TabsTrigger value={PARAMETERS_TAB}>
                {t("settings.searchIndex.tabs.parameters")}
              </TabsTrigger>
              <TabsTrigger value={TEST_TAB}>
                {t("settings.searchIndex.tabs.test")}
              </TabsTrigger>
            </TabsList>
          </div>
        </header>

        <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
          <TabsContent className="flex-none space-y-6" value={DEFAULT_TAB}>
            <SearchIndexOverviewTab />
          </TabsContent>
          <TabsContent className="flex-none space-y-6" value={PARAMETERS_TAB}>
            <SearchIndexParametersTab />
          </TabsContent>
          <TabsContent className="flex-none space-y-6" value={TEST_TAB}>
            <SearchIndexTestSearchTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
