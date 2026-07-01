import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import type React from "react";

export function SourceItemMetadataRow({
  children,
  label,
  tooltip,
}: {
  children: React.ReactNode;
  label: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-32 shrink-0 items-center gap-1 text-muted-foreground text-sm">
        {label}
        {tooltip ? (
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground/70">?</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </div>
  );
}
