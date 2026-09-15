// What kind of conversation this is, as one badge read the same everywhere:
// the chat header, the desk switcher, the Space's chat list, and the composer
// hint. Who reads the thread is the one fact a person must never get wrong,
// so the badge is a statement (with its reason in the title), not decoration.
"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Lock, MessagesSquare, Sparkles, Users } from "lucide-react";

export type ChatKind = "copilot" | "desk" | "dm" | "room";

const ICONS = {
  copilot: Sparkles,
  desk: Users,
  dm: Lock,
  room: MessagesSquare,
} as const;

const TONES: Record<ChatKind, string> = {
  copilot: "border-primary/30 bg-primary/10 text-primary",
  desk: "border-border bg-muted/60 text-muted-foreground",
  dm: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  room: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

export interface ChatKindBadgeProps {
  className?: string;
  /** Glyph only — for a dense list row; the label rides in the title. */
  iconOnly?: boolean;
  kind: ChatKind;
  /** Rooms: how many members (agents and people) are in it. */
  memberCount?: number | null;
  /** The agent's name — a DM's title says who the other party is. */
  name?: string | null;
  /** The Space's name — a desk's title says whose team reads it. */
  spaceName?: string | null;
}

/** The badge's short label and the sentence behind it. */
export function useChatKindCopy(input: {
  kind: ChatKind;
  memberCount?: number | null;
  name?: string | null;
  spaceName?: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  const name = input.name?.trim() || t("chatKind.theAgent");
  const space = input.spaceName?.trim() || t("chatKind.theSpace");
  switch (input.kind) {
    case "dm":
      return {
        hint: t("chatKind.dm.hint", { name }),
        label: t("chatKind.dm.label"),
        readers: t("chatKind.dm.readers", { name }),
      };
    case "room":
      return {
        hint: t("chatKind.room.hint"),
        label:
          typeof input.memberCount === "number" && input.memberCount > 0
            ? t("chatKind.room.labelWithCount", { count: input.memberCount })
            : t("chatKind.room.label"),
        readers: t("chatKind.room.readers"),
      };
    case "copilot":
      return {
        hint: t("chatKind.copilot.hint"),
        label: t("chatKind.copilot.label"),
        readers: t("chatKind.copilot.readers"),
      };
    default:
      return {
        hint: t("chatKind.desk.hint", { space }),
        // Space belongs in the hint, not the chip — "Shared desk · test eins"
        // was a second title next to the agent's name.
        label: t("chatKind.desk.label"),
        readers: t("chatKind.desk.readers", { space }),
      };
  }
}

export function ChatKindBadge({
  className,
  iconOnly = false,
  kind,
  memberCount,
  name,
  spaceName,
}: ChatKindBadgeProps) {
  const copy = useChatKindCopy({ kind, memberCount, name, spaceName });
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-[11rem] shrink items-center gap-0.5 rounded-full border font-medium text-[10px] leading-none",
        iconOnly ? "p-0.5" : "px-1 py-px",
        TONES[kind],
        className
      )}
      data-chat-kind={kind}
      title={`${copy.label} — ${copy.hint}`}
    >
      <Icon aria-hidden className="size-2.5 shrink-0" strokeWidth={2} />
      {iconOnly ? (
        <span className="sr-only">{copy.label}</span>
      ) : (
        <span className="min-w-0 truncate">{copy.label}</span>
      )}
    </span>
  );
}
