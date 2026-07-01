/**
 * “Neue Daten-Quelle” flyout — manual, file upload, then registry adapters.
 * Navigates to the sources list with router state so the correct create dialog opens.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@engenty/ui-core";
import { Database, FileUp, PenLine } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  type KbOpenSourceAddPreset,
  kbOpenSourceAddLocationState,
} from "../kb-open-source-add-state.js";
import { kbSourcesPath } from "../kb-paths.js";
import { mergeKbSourceAdaptersForPicker } from "../kb-source-adapters-merge.js";
import { sourceAdaptersQueryOptions } from "../queries.js";

export function KbModuleAddSourceSubmenu({
  kbSlug,
  withShellItemProps = false,
}: {
  kbSlug: string;
  withShellItemProps?: boolean;
}) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const { data: adaptersRaw = [] } = useQuery(sourceAdaptersQueryOptions);
  const adaptersForAddMenu = useMemo(() => {
    const adapters = mergeKbSourceAdaptersForPicker(adaptersRaw);
    return adapters.filter((a) => a.id !== "manual" && a.id !== "file_upload");
  }, [adaptersRaw]);
  const itemProps = withShellItemProps ? shellSecondaryNavItemProps : {};

  const openPreset = (preset: KbOpenSourceAddPreset) => {
    navigate(kbSourcesPath(kbSlug), {
      state: kbOpenSourceAddLocationState(preset),
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger {...itemProps}>
        <Database aria-hidden className="h-4 w-4" />
        {t("add_menu.source")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-[12rem]">
        <DropdownMenuItem onSelect={() => openPreset("manual")}>
          <PenLine aria-hidden className="h-4 w-4" />
          {t("sources.add_manual")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openPreset("file_upload")}>
          <FileUp aria-hidden className="h-4 w-4" />
          {t("sources.add_file_upload")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {adaptersForAddMenu.length === 0 ? (
          <DropdownMenuItem disabled>
            {t("sources.no_adapters")}
          </DropdownMenuItem>
        ) : (
          adaptersForAddMenu.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => openPreset({ adapterId: item.id })}
            >
              {item.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
