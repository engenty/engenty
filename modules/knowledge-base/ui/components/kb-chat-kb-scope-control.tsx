/**
 * Knowledge-base picker for KB hub / KB chat composer footer: one KB or "all".
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { kbDisplayName } from "../kb-display-name.js";

export type KbChatScopeValue = "all" | string;

export interface KbChatKbScopeControlProps {
  kbs: KnowledgeBase[];
  kbsLoading: boolean;
  onKbChange: (kbId: KbChatScopeValue) => void;
  selected: KbChatScopeValue;
}

export function KbChatKbScopeControl({
  kbs,
  kbsLoading,
  onKbChange,
  selected,
}: KbChatKbScopeControlProps) {
  const { t } = useTranslation("kb");

  const selectedRow =
    selected === "all" ? null : kbs.find((k) => k.id === selected);
  const triggerLabel =
    selected === "all"
      ? t("hub.chat_scope_all")
      : selectedRow
        ? kbDisplayName(selectedRow, t)
        : kbsLoading
          ? "…"
          : t("hub.chat_scope_pick_kb");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("hub.chat_kb_scope_aria")}
          className="h-8 max-w-[min(11rem,40vw)] shrink-0 gap-1 px-2 font-normal text-muted-foreground text-xs hover:text-foreground"
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {triggerLabel}
          </span>
          <ChevronDown aria-hidden className="size-3 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-64 overflow-y-auto"
      >
        <DropdownMenuItem
          className={selected === "all" ? "bg-muted/60" : undefined}
          onSelect={() => onKbChange("all")}
        >
          {t("hub.chat_scope_all")}
        </DropdownMenuItem>
        {kbs.map((kb) => (
          <DropdownMenuItem
            className={kb.id === selected ? "bg-muted/60" : undefined}
            key={kb.id}
            onSelect={() => onKbChange(kb.id)}
          >
            <span className="min-w-0 truncate">{kbDisplayName(kb, t)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
