"use client";

// The line in a transcript where the agent's verbatim memory ends. Above it
// the turns reach the model only as the observer's condensed notes; below it
// they are still sent as written. Opening the line shows those notes, read-only:
// the honest answer to "what does it still know from up there".

import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from "@engenty/ui-core";
import { Brain } from "lucide-react";
import { useState } from "react";
import type { ThreadMemoryObservations } from "../../../threads/thread-memory-observations.js";

function countObservationLines(text: string): number {
  return text.split("\n").filter((line) => /^\s*[*-]\s+\S/.test(line)).length;
}

export function MemoryBreakDivider({
  className,
  memory,
}: {
  className?: string;
  memory: ThreadMemoryObservations;
}) {
  const { t, i18n } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);
  const observations = memory.active_observations.trim();
  const count = countObservationLines(observations);
  const reflected = memory.generation_count > 0;
  const observedAt = memory.last_observed_at
    ? new Date(memory.last_observed_at).toLocaleString(i18n.language || "en", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <>
      <div
        className={cn("flex w-full items-center gap-3", className)}
        data-testid="memory-break"
      >
        <span aria-hidden className="h-px flex-1 bg-border" />
        <button
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-muted-foreground text-xs hover:bg-muted/60 hover:text-foreground"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Brain aria-hidden className="size-3.5" />
          <span>
            {reflected
              ? t("memoryBreak.reflected", { count })
              : t("memoryBreak.label", { count })}
          </span>
        </button>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("memoryBreak.title")}</DialogTitle>
            <DialogDescription>
              {observedAt
                ? t("memoryBreak.description", {
                    count,
                    generation: memory.generation_count,
                    observedAt,
                  })
                : t("memoryBreak.descriptionNoDate", {
                    count,
                    generation: memory.generation_count,
                  })}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border border-border bg-muted/20">
            {observations ? (
              <pre className="whitespace-pre-wrap break-words p-3 font-sans text-sm leading-6">
                {observations}
              </pre>
            ) : (
              <p className="p-3 text-muted-foreground text-sm">
                {t("memoryBreak.empty")}
              </p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
