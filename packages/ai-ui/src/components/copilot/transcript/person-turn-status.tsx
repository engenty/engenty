"use client";

// What a person sees of a turn's work afterwards, when the model wrote its
// reasoning down: a closed "Thought it through" they can open. While it runs,
// the transcript's status line says what it is doing.

import { useTranslation } from "@engenty/i18n/ui";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { MessageResponse } from "../../ai-elements/message";

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
