"use client";

// The Copilot's own accounts from its pane menu: the person's connections,
// which only they and their Copilot use, in any Space.
import { useTranslation } from "@engenty/i18n/ui";
import { DropdownMenuItem } from "@engenty/ui-core";
import { Blocks } from "lucide-react";

export function CopilotConnectionsMenuItem({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation("ai-ui");
  return (
    <DropdownMenuItem className="flex items-center gap-2" onSelect={onOpen}>
      <Blocks aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span>{t("agentDesk.copilot.myConnections")}</span>
    </DropdownMenuItem>
  );
}
