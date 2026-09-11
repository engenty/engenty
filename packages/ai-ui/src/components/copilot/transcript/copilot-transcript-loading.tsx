"use client";

import { cn } from "@engenty/ui-core";
import { CHAT_LANE_COLUMN_CLASS } from "../chat-lane/chat-lane-layout.js";

export interface CopilotTranscriptLoadingProps {
  className?: string;
  /** Screen-reader label; no visible loading line (avoids layout shift). */
  label: string;
  surface?: "default" | "chat";
}

/** Reserved-height placeholder while a thread is being fetched. */
export function CopilotTranscriptLoading({
  className,
  label,
  surface = "default",
}: CopilotTranscriptLoadingProps) {
  const barWidths =
    surface === "chat"
      ? ["w-[72%] max-w-md", "w-[48%] max-w-xs", "w-[56%] max-w-sm"]
      : ["w-4/5 max-w-sm", "w-3/5 max-w-xs", "w-2/3 max-w-sm"];

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn(
        "flex min-h-[5.5rem] flex-col gap-2.5 pt-1",
        surface === "chat" && CHAT_LANE_COLUMN_CLASS,
        className
      )}
      role="status"
    >
      {barWidths.map((widthClass) => (
        <div
          aria-hidden
          className={cn("h-3 animate-pulse rounded-md bg-muted/50", widthClass)}
          key={widthClass}
        />
      ))}
    </div>
  );
}
