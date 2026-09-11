/**
 * KB module settings — the tenant-wide index infrastructure: embedding model,
 * retrieval quality, and a test search. One vector index serves every library
 * in every space, so nothing here is per space or per library. Libraries are
 * managed where they live (the space's knowledge-base root); a library's own
 * settings (chunking, templates, comments, properties, space) live on its
 * scoped settings page.
 */

import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { KbSettingsGeneralSection } from "../components/settings/kb-settings-general-section.js";
import type { KbSettingsToolbarSaveSlot } from "../components/settings/kb-settings-types.js";
import { useKbSettingsAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { kbModulePageFillShellSectionClassName } from "../lib/kb-page-shell.js";
import { kbsQueryOptions } from "../queries.js";

export function KbSettingsPage() {
  const { t } = useTranslation("kb");

  const [toolbarSave, setToolbarSave] =
    useState<KbSettingsToolbarSaveSlot | null>(null);

  // Tenant-wide: the agent-UI slice describes the module, not one space.
  const { data: kbs = [] } = useQuery(kbsQueryOptions(null));
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
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  return (
    <section className={kbModulePageFillShellSectionClassName}>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
        <div className="mx-auto w-full max-w-4xl space-y-8">
          <header className="space-y-1">
            <h1 className="font-semibold text-xl">{t("settings.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("settings.page_description")}
            </p>
          </header>
          <KbSettingsGeneralSection setToolbarSaveSlot={setToolbarSave} />
        </div>
      </div>
    </section>
  );
}
