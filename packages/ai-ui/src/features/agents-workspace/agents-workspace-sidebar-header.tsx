// Simple "Engenty" title rendered in the app shell secondary column header slot.
// Matches the ChatShellHeader / KB KbShellKnowledgeBaseLinks slot shape.

import { useTranslation } from "@engenty/i18n/ui";

export function AgentsWorkspaceSidebarHeader() {
  const { t } = useTranslation("ai-ui");
  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 truncate font-medium text-foreground text-sm">
        {t("menu.engenty")}
      </span>
    </div>
  );
}
