/**
 * Main shell nav actions for Knowledge Base (settings gear, then primary “+ Neu” menu).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { Settings } from "lucide-react";
import type * as React from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { kbNewArticleEditPath, kbNewFaqEditPath } from "../kb-paths.js";
import { kbsQueryOptions } from "../queries.js";
import { kbIdFromSlug } from "../resolve-kb-id.js";
import {
  type KbModuleAddMenuHandlers,
  KbModuleAddMenuTopbarTrigger,
} from "./kb-module-add-menu.js";
import { KbAddInTreeDialog } from "./kb-sidebar/kb-add-in-tree-dialog.js";

export interface KbModuleShellActionsProps {
  /** Hide the global KB settings gear (e.g. on category view where category settings is separate). */
  hideKbSettings?: boolean;
  kbSlug: string;
  /**
   * When set, replaces the generic “+ Neu” dropdown (e.g. KB sources list:
   * pick adapter then open create dialog).
   */
  primaryAddMenu?: React.ReactNode;
}

export function KbModuleShellActions({
  kbSlug,
  hideKbSettings = false,
  primaryAddMenu,
}: KbModuleShellActionsProps) {
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const { data: kbsRaw } = useQuery(kbsQueryOptions);
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const kbId = kbIdFromSlug(kbs, kbSlug);

  const addMenuHandlers = useMemo<KbModuleAddMenuHandlers>(
    () => ({
      onAddArticle: () => navigate(kbNewArticleEditPath(kbSlug)),
      onAddFaq: () => navigate(kbNewFaqEditPath(kbSlug)),
      onAddCategory: () => setAddCategoryOpen(true),
    }),
    [kbSlug, navigate]
  );

  return (
    <div className="flex items-center gap-2">
      {hideKbSettings ? null : (
        <Button
          className="h-6 w-6 border-0 p-0 text-muted-foreground shadow-none hover:border-0 hover:bg-transparent hover:text-foreground"
          onClick={() => navigate("/settings/knowledge-base")}
          size="sm"
          title={tCommon("navigation.settings")}
          type="button"
          variant="outline"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}
      {primaryAddMenu ?? (
        <KbModuleAddMenuTopbarTrigger
          handlers={addMenuHandlers}
          kbSlug={kbSlug}
        />
      )}
      {kbId ? (
        <KbAddInTreeDialog
          defaultMode="category"
          kbId={kbId}
          kbSlug={kbSlug}
          lockMode
          onClose={() => setAddCategoryOpen(false)}
          open={addCategoryOpen}
        />
      ) : null}
    </div>
  );
}
