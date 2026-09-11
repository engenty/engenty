/**
 * "This chat belongs to a different space" — the guard for the one case where
 * the URL and the conversation genuinely disagree (PLAN-space-chats.md S4c).
 *
 * A run reads its space off the THREAD row (`resolveRunSpace`), never off the
 * address bar. So a thread opened from elsewhere — a notification, a bookmark,
 * a link a colleague pasted — keeps answering with its own space's agents,
 * connections and `/data` while the shell around it says you are somewhere
 * else. Nothing about the transcript shows that, and the wrong-space answer
 * looks like a broken agent rather than a misplaced chat.
 *
 * It is deliberately NOT retargeted. Moving a conversation between spaces would
 * change what it may reach halfway through, which is a worse surprise than the
 * one being reported. The offer is a NEW chat here; the old one stays where it
 * belongs and stays readable.
 */
import { THREAD_CONTEXT_INLINE_PAD_VAR } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Info } from "lucide-react";

export function SpaceMismatchNotice({
  className,
  onContinueHere,
  routeSpaceId,
  threadSpaceId,
}: {
  className?: string;
  onContinueHere: () => void;
  /** The space in the URL. Null outside `/s/…`, where there is nothing to compare. */
  routeSpaceId: string | null;
  /** Null on a thread from before the Phase C2 backfill — not a mismatch. */
  threadSpaceId: string | null | undefined;
}) {
  const { t } = useTranslation("engenty-copilot");
  if (!(routeSpaceId && threadSpaceId) || routeSpaceId === threadSpaceId) {
    return null;
  }
  return (
    <div
      className={cn("shrink-0 px-page pt-3", className)}
      // The floating thread-context card overlaps the right of this lane, and
      // it lands exactly on the action button. Same reservation the transcript
      // itself makes — the card sets this variable, and 0 when it is not
      // floating, so the notice is only inset while something is actually
      // there.
      style={{ paddingRight: `var(${THREAD_CONTEXT_INLINE_PAD_VAR}, 0px)` }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-start gap-3">
        <div className="flex w-full items-start gap-3 rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              {t("chat.spaceMismatchTitle")}
            </p>
            <p className="mt-0.5 text-muted-foreground text-sm">
              {t("chat.spaceMismatchBody")}
            </p>
          </div>
          <Button
            className="shrink-0"
            onClick={onContinueHere}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("chat.spaceMismatchAction")}
          </Button>
        </div>
      </div>
    </div>
  );
}
