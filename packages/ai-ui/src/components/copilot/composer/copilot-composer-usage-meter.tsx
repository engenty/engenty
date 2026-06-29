"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useCopilotThreadUsage } from "../../../ag-ui/session-usage/use-copilot-thread-usage.js";

export interface CopilotComposerUsageMeterProps {
  chatStatus: "ready" | "streaming" | "submitted" | "error";
  className?: string;
  threadId: string | null;
}

/** Muted token + estimated cost line below the copilot composer. */
export function CopilotComposerUsageMeter({
  chatStatus,
  className,
  threadId,
}: CopilotComposerUsageMeterProps) {
  const { t } = useTranslation("common");
  const { isLoading, line } = useCopilotThreadUsage({ chatStatus, threadId });

  if (!threadId) {
    return null;
  }

  const label =
    line ?? (isLoading ? t("copilot.usage.loading") : t("copilot.usage.empty"));

  return (
    <p
      aria-live="polite"
      className={cn(
        "px-0.5 pt-1 text-muted-foreground text-xxs tabular-nums leading-snug",
        className
      )}
    >
      {label}
    </p>
  );
}
