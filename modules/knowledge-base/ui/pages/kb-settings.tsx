/**
 * KB module settings: knowledge bases list and tenant-wide configuration.
 */

import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { KbSettingsGeneralSection } from "../components/settings/kb-settings-general-section.js";
import { KbSettingsKnowledgeBasesSection } from "../components/settings/kb-settings-knowledge-bases-section.js";
import type { KbSettingsToolbarSaveSlot } from "../components/settings/kb-settings-types.js";
import { useKbSettingsAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { kbModulePageFillShellSectionClassName } from "../lib/kb-page-shell.js";
import { kbsQueryOptions } from "../queries.js";

const KB_SETTINGS_TAB = "general";

export function KbSettingsPage() {
  const { t } = useTranslation("kb");

  const [toolbarSave, setToolbarSave] =
    useState<KbSettingsToolbarSaveSlot | null>(null);

  const { data: kbs = [], isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  useKbSettingsAgentUiSlice({ kbs });

  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("breadcrumb.settings"));

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("menu.knowledge_base") },
    ],
    [moduleRootCrumb, t]
  );

  const pageActions = useMemo(() => {
    if (!toolbarSave) {
      return null;
    }
    const slot = toolbarSave;
    return (
      <Button
        className={topbarIconButtonClassName}
        disabled={slot.disabled}
        onClick={slot.onSave}
        size="sm"
        type="button"
      >
        {slot.pending ? (
          <AnimatedLoaderIcon
            aria-hidden
            className="md:mr-1.5"
            play="always"
            size="sm"
          />
        ) : (
          <Save aria-hidden className="h-4 w-4 md:mr-1.5" />
        )}
        <TopbarActionLabel>
          {slot.pending ? t("actions.saving") : t("actions.save")}
        </TopbarActionLabel>
      </Button>
    );
  }, [toolbarSave, t]);

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  return (
    <section className={kbModulePageFillShellSectionClassName}>
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        value={KB_SETTINGS_TAB}
      >
        <header className="sticky top-0 z-10 w-full shrink-0 bg-paper">
          <div className="p-page pt-3 pb-0">
            <div className="mx-auto flex w-full max-w-4xl flex-col border-border border-b">
              <div className="flex items-end">
                <TabsList
                  className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
                  variant="line"
                >
                  <TabsTrigger value={KB_SETTINGS_TAB}>
                    {t("settings.tabs.general")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
          <div className="mx-auto w-full max-w-4xl space-y-8">
            <TabsContent className="space-y-8" value={KB_SETTINGS_TAB}>
              <KbSettingsKnowledgeBasesSection
                isLoading={kbsLoading}
                kbs={kbs}
              />
              <KbSettingsGeneralSection setToolbarSaveSlot={setToolbarSave} />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </section>
  );
}
