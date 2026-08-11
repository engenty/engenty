import { MessageResponse } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type {
  InboxDigestParticipant,
  InboxMessageCategory,
  InboxThreadDigest,
} from "../api.js";
import { CategoryTag } from "./category-tag.js";

/** Shared prose rules for digest / status markdown in the conversation column. */
export const DIGEST_PROSE_CLASSES = cn(
  "text-sm leading-relaxed",
  "[&_p]:my-1.5",
  "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:font-semibold [&_h1]:text-sm",
  "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:font-semibold [&_h2]:text-sm",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-sm",
  "[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h4]:text-sm",
  "[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0",
  "[&_strong]:font-semibold",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5 [&_li]:pl-0.5",
  "[&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
  "[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto",
  "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
  "[&_td]:border [&_td]:px-2 [&_td]:py-1"
);

const AVATAR_CLASSES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function avatarClassFor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(31, hash) + key.charCodeAt(index);
  }
  return AVATAR_CLASSES[Math.abs(hash) % AVATAR_CLASSES.length];
}

function initialsFor(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  const words = source.split(/[\s.@_-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

function ParticipantChip({
  participant,
}: {
  participant: InboxDigestParticipant;
}) {
  const label = participant.name || participant.email;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex max-w-64 items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs">
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full font-semibold text-[8px]",
                avatarClassFor(participant.email)
              )}
            >
              {initialsFor(participant.name, participant.email)}
            </span>
            <span className="truncate font-medium">{label}</span>
            {participant.role ? (
              <span className="truncate text-muted-foreground">
                · {participant.role}
              </span>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent>{participant.email}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Status summary + AI action chips. Renders in the scroll flow under the
 * transcript — not sticky — so the sticky footer can own AI ask / Reply.
 */
export function ThreadAssistantZone({
  category,
  onAsk,
  onCollapse,
  onSummarize,
  open,
  summarizing,
  summary,
}: {
  category: InboxMessageCategory;
  onAsk: (action: string) => void;
  onCollapse: () => void;
  onSummarize: () => void;
  open: boolean;
  summarizing: boolean;
  summary: InboxThreadDigest | null;
}) {
  const { t } = useTranslation("inbox");
  const chips =
    summary && summary.suggested_actions.length > 0
      ? summary.suggested_actions
      : [t("optimized.fallbackDraftReply"), t("optimized.fallbackOpenPoints")];

  return (
    <div className="border-t pt-3">
      {summary ? (
        <>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              <Sparkles className="size-3.5" />
              {t("optimized.summaryTitle")}
            </span>
            <CategoryTag category={category} />
            <Button
              className="ml-auto size-6"
              onClick={onCollapse}
              size="icon-sm"
              title={
                open
                  ? t("optimized.collapseSummary")
                  : t("optimized.expandSummary")
              }
              variant="ghost"
            >
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
            </Button>
          </div>
          {open ? (
            <div className="pt-1">
              <div className={DIGEST_PROSE_CLASSES}>
                <MessageResponse>{summary.summary_md}</MessageResponse>
              </div>
              {summary.participants_json.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {summary.participants_json.map((participant) => (
                    <ParticipantChip
                      key={participant.email}
                      participant={participant}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 py-2.5">
        {summary ? null : (
          <Button
            disabled={summarizing}
            onClick={onSummarize}
            size="sm"
            variant="outline"
          >
            {summarizing ? (
              <Sparkles className="size-3.5 animate-pulse" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {summarizing
              ? t("optimized.summarizing")
              : t("optimized.summarize")}
          </Button>
        )}
        {chips.map((action) => (
          <button
            className="rounded-full border border-dashed px-2.5 py-1 text-left text-xs transition-colors hover:bg-accent"
            key={action}
            onClick={() => onAsk(action)}
            type="button"
          >
            <Sparkles className="mr-1 inline size-3" />
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
