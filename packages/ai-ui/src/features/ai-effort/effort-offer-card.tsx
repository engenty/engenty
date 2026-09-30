"use client";

// The server's question before a big Normal turn: run it on Extra? Docked
// behind the composer like an interrupt card — the turn is held, unsent, until
// the person answers, and either answer sends it exactly once.

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Sparkles } from "lucide-react";

export function EffortOfferCard(props: {
  onAnswer: (choice: "extra" | "normal") => void;
  /** The server's reason, for anyone hovering to ask why. */
  reason?: string;
}) {
  const { t } = useTranslation("ai-ui");
  return (
    <div
      className="flex flex-col gap-2 rounded-md bg-background/70 px-3 py-2.5"
      role="alert"
      title={props.reason || undefined}
    >
      <div className="flex items-start gap-2">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-snug">
            {t("effort.offer.title")}
          </p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
            {t("effort.offer.body")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => props.onAnswer("normal")}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("effort.offer.normal")}
        </Button>
        <Button onClick={() => props.onAnswer("extra")} size="sm" type="button">
          {t("effort.offer.extra")}
        </Button>
      </div>
    </div>
  );
}
