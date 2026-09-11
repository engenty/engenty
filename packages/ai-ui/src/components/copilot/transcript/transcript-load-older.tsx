"use client";

// The top of a paged transcript. A thread is meant to outlive its compaction,
// so the lane opens on the newest page and the rest stays on the server until
// someone scrolls up for it.

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { History, Loader2 } from "lucide-react";
import type { EngentyThreadOlderMessages } from "../../../threads/use-engenty-thread.js";

export function TranscriptLoadOlder(props: {
  olderMessages: EngentyThreadOlderMessages;
}) {
  const { t } = useTranslation("ai-ui");
  if (!props.olderMessages.hasMore) {
    return null;
  }
  return (
    <div className="flex justify-center py-1">
      <Button
        disabled={props.olderMessages.isLoading}
        onClick={props.olderMessages.load}
        size="sm"
        type="button"
        variant="ghost"
      >
        {props.olderMessages.isLoading ? (
          <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin" />
        ) : (
          <History aria-hidden className="mr-1.5 size-4" />
        )}
        {props.olderMessages.isLoading
          ? t("transcript.loadingOlder")
          : t("transcript.loadOlder")}
      </Button>
    </div>
  );
}
