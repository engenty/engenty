// Pinned messages of a conversation, behind a topbar icon button. Each entry
// deep-links to the message (`?ts=`) so the stream scrolls to and flashes it.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { Pin } from "lucide-react";
import { Link } from "react-router-dom";
import {
  authorColorClass,
  authorLabel,
  mentionTokensToPlainText,
  timeAgo,
  type UsersById,
} from "../lib/format.js";
import { usePinsQuery } from "../queries.js";

export function PinsPopover({
  conversationId,
  users,
}: {
  conversationId: string;
  users: UsersById;
}) {
  const { t, i18n } = useTranslation("team-chat");
  const pinsQuery = usePinsQuery(conversationId);
  const pins = (pinsQuery.data ?? []).filter((pin) => pin.message);

  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={t("pinsPopover.title")}
                size="icon-sm"
                variant="ghost"
              >
                <Pin className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("pinsPopover.title")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="end" className="w-80 p-2">
        <h3 className="flex items-center gap-1.5 px-2 pb-1.5 font-semibold text-sm">
          <Pin className="size-3.5 text-amber-600 dark:text-amber-400" />
          {t("pinsPopover.title")}
          {pins.length > 0 ? (
            <span className="text-muted-foreground text-xs">{pins.length}</span>
          ) : null}
        </h3>
        {pins.length === 0 ? (
          <p className="px-2 pb-1 text-muted-foreground text-sm">
            {t("overview.noPins")}
          </p>
        ) : (
          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {pins.map((pin) => {
              const message = pin.message;
              if (!message) {
                return null;
              }
              const isAgent = Boolean(message.agent_type_key);
              return (
                <Link
                  className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/6"
                  key={pin.message_ts}
                  to={`/mdl/team-chat/${conversationId}?ts=${pin.message_ts}`}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "truncate font-semibold text-xs",
                        authorColorClass(isAgent)
                      )}
                    >
                      {authorLabel(message, users)}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
                      {timeAgo(message.ts, i18n.language)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-foreground/90 text-sm leading-snug">
                    {mentionTokensToPlainText(message.text, users)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
