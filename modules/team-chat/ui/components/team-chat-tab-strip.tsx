// The dashboard's conversation tabs: "Übersicht" plus the last 5 opened
// conversations, manually closable (decision: no tab row inside a channel).
// Styled after the ui-core line TabsList; real Links since a tab click
// navigates instead of switching local TabsContent.
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Hash, Lock, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { ConversationListItem } from "../api.js";

function tabIcon(conversation: ConversationListItem) {
  if (conversation.type === "private_channel") {
    return Lock;
  }
  if (conversation.type === "public_channel") {
    return Hash;
  }
  return Users;
}

const TAB_BASE =
  "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 font-medium text-sm transition-colors " +
  "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-[var(--ember)] after:opacity-0 after:transition-opacity";

export interface TeamChatTabStripProps {
  /** Resolved conversations for the recent-tab ids (missing ones are skipped). */
  conversationsById: ReadonlyMap<string, ConversationListItem>;
  labelFor: (conversation: ConversationListItem) => string;
  onClose: (conversationId: string) => void;
  /** Recent conversation ids, most recent first (max 5). */
  tabs: readonly string[];
}

export function TeamChatTabStrip({
  conversationsById,
  labelFor,
  onClose,
  tabs,
}: TeamChatTabStripProps) {
  const { t } = useTranslation("team-chat");
  return (
    <nav className="-mb-px flex items-center overflow-x-auto">
      {/* On the dashboard the overview tab is always the active one. */}
      <Link
        aria-current="page"
        className={cn(TAB_BASE, "text-foreground after:opacity-100")}
        to="/mdl/team-chat"
      >
        {t("nav.overview")}
      </Link>
      {tabs.map((id) => {
        const conversation = conversationsById.get(id);
        if (!conversation) {
          return null;
        }
        const Icon = tabIcon(conversation);
        const hasMention = conversation.mention_count > 0;
        const unread = conversation.unread_count;
        return (
          <span className="group/tab relative flex items-center" key={id}>
            <Link
              className={cn(
                TAB_BASE,
                "pr-7 text-foreground/60 hover:text-foreground",
                unread > 0 && "text-foreground"
              )}
              to={`/mdl/team-chat/${id}`}
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-36 truncate">
                {labelFor(conversation)}
              </span>
              {hasMention ? (
                <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />
              ) : null}
              {unread > 0 ? (
                <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground tabular-nums">
                  {unread}
                </span>
              ) : null}
            </Link>
            <button
              aria-label={t("tabs.close")}
              className="absolute right-1.5 hidden rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground group-hover/tab:block"
              onClick={() => onClose(id)}
              type="button"
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
    </nav>
  );
}
