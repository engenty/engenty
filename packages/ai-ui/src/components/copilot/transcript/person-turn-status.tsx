"use client";

// What a person sees of a turn's work, in place of the step list: one line
// while it runs, and afterwards — when the model wrote its reasoning down —
// a closed "Thought it through" they can open.

import { useTranslation } from "@engenty/i18n/ui";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { MessageResponse } from "../../ai-elements/message";
import { Shimmer } from "../../ai-elements/shimmer";
import { formatElapsedSeconds } from "../composer/agent-status-ticker/format-elapsed-seconds.js";

export function PersonWorkingLine({
  elapsedSeconds,
}: {
  elapsedSeconds: number;
}) {
  const { t } = useTranslation("ai-ui");
  return (
    <div
      className="flex items-center justify-center gap-2 text-muted-foreground text-xs"
      data-testid="person-working-line"
    >
      <Shimmer as="span" duration={2} spread={2}>
        {t("toolClip.working")}
      </Shimmer>
      <span className="tabular-nums">
        {formatElapsedSeconds(elapsedSeconds)}
      </span>
    </div>
  );
}

export function PersonThoughtDisclosure({ text }: { text: string }) {
  const { t } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center">
      <button
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {t("toolClip.thought")}
        <ChevronDown
          aria-hidden
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <MessageResponse className="mt-2 w-full border-border border-l-2 pl-3 text-muted-foreground text-sm">
          {text}
        </MessageResponse>
      ) : null}
    </div>
  );
}
