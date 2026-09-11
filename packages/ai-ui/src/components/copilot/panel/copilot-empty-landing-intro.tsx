import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";

export function CopilotEmptyLandingIntro({
  alignStart,
  header,
  subtitle,
  title,
}: {
  alignStart: boolean;
  header?: ReactNode;
  subtitle?: string;
  title?: string;
}) {
  if (header) {
    return header;
  }
  if (!title) {
    return null;
  }
  return (
    <div
      className={cn("mb-6 space-y-1", alignStart ? "text-left" : "text-center")}
    >
      <p className="font-medium text-2xl text-foreground tracking-tight md:text-3xl">
        {title}
      </p>
      {subtitle ? (
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      ) : null}
    </div>
  );
}
