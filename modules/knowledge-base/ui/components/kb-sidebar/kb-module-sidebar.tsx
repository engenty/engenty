/**
 * Module secondary column: full {@link KbSidebar} when a KB is active,
 * otherwise {@link KbModuleSidebarOverview} (settings, module nav, empty hints).
 */

import { KbModuleSidebarOverview } from "./kb-module-sidebar-overview.js";
import { KbSidebar } from "./kb-sidebar.js";

export function KbModuleSidebar({
  activeArticleId,
  kbId,
}: {
  activeArticleId?: string;
  kbId: string;
}) {
  if (kbId) {
    return <KbSidebar activeArticleId={activeArticleId} kbId={kbId} />;
  }

  return <KbModuleSidebarOverview />;
}
