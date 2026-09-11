import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DevelopmentAgentsTab } from "@/features/development-settings/development-agents-tab";
import { DevelopmentSearchIndexTab } from "@/features/development-settings/development-search-index-tab";

const DEFAULT_TAB = "agents";
const SEARCH_INDEX_TAB = "search-index";
const LEGACY_CONTACTS_INDEX_TAB = "contacts-index";
const VALID_TABS = new Set([
  DEFAULT_TAB,
  SEARCH_INDEX_TAB,
  LEGACY_CONTACTS_INDEX_TAB,
]);

export function DevelopmentSettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const rawTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : DEFAULT_TAB;
  const resolvedTab =
    rawTab === LEGACY_CONTACTS_INDEX_TAB ? SEARCH_INDEX_TAB : rawTab;

  useEffect(() => {
    if (tabParam !== LEGACY_CONTACTS_INDEX_TAB) {
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set("tab", SEARCH_INDEX_TAB);
    setSearchParams(params, { replace: true });
  }, [tabParam, searchParams, setSearchParams]);

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings.development.title") },
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
    const normalizedNext =
      next === LEGACY_CONTACTS_INDEX_TAB ? SEARCH_INDEX_TAB : next;
    const params = new URLSearchParams(searchParams);
    if (normalizedNext === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", normalizedNext);
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
              <TabsTrigger value="agents">
                {t("settings.development.tabs.agents")}
              </TabsTrigger>
              <TabsTrigger value={SEARCH_INDEX_TAB}>
                {t("settings.development.tabs.searchIndex")}
              </TabsTrigger>
            </TabsList>
          </div>
        </header>

        <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
          <TabsContent className="flex-none space-y-6" value="agents">
            <DevelopmentAgentsTab />
          </TabsContent>
          <TabsContent className="flex-none space-y-6" value={SEARCH_INDEX_TAB}>
            <DevelopmentSearchIndexTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
