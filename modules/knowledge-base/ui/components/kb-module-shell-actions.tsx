/**
 * Main shell nav actions for Knowledge Base (settings gear, then primary “+ Neu” menu).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useCanAdministerTenant } from "@engenty/ui-plugin-sdk";
import { Settings } from "lucide-react";
import type * as React from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { kbNewArticleEditPath, kbNewFaqEditPath } from "../kb-paths.js";
import { useKbsQuery } from "../queries.js";
import { spaceKbId } from "../resolve-kb-id.js";
import {
  type KbModuleAddMenuHandlers,
  KbModuleAddMenuTopbarTrigger,
} from "./kb-module-add-menu.js";
import { KbAddInTreeDialog } from "./kb-sidebar/kb-add-in-tree-dialog.js";

export interface KbModuleShellActionsProps {
  /** Hide the global KB settings gear (e.g. on category view where category settings is separate). */
  hideKbSettings?: boolean;
  /**
   * When set, replaces the generic “+ Neu” dropdown (e.g. KB sources list:
   * pick adapter then open create dialog).
   */
  primaryAddMenu?: React.ReactNode;
}

export function KbModuleShellActions({
  hideKbSettings = false,
  primaryAddMenu,
}: KbModuleShellActionsProps) {
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const { data: kbsRaw } = useKbsQuery();
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const canAdministerTenant = useCanAdministerTenant();
  const kbId = spaceKbId(kbs);

  const addMenuHandlers = useMemo<KbModuleAddMenuHandlers>(
    () => ({
      onAddArticle: () => navigate(kbNewArticleEditPath()),
      onAddFaq: () => navigate(kbNewFaqEditPath()),
      onAddCategory: () => setAddCategoryOpen(true),
    }),
    [navigate]
  );

  return (
    <div className="flex items-center gap-2">
      {/* Same reason as the hub empty state: /settings/knowledge-base is
          admin-only and redirects members away without a word, so do not show
          them the gear at all. */}
      {hideKbSettings || !canAdministerTenant ? null : (
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
        <KbModuleAddMenuTopbarTrigger handlers={addMenuHandlers} />
      )}
      {kbId ? (
        <KbAddInTreeDialog
          defaultMode="category"
          kbId={kbId}
          lockMode
          onClose={() => setAddCategoryOpen(false)}
          open={addCategoryOpen}
        />
      ) : null}
    </div>
  );
}
