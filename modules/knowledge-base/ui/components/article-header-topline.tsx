import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";

/** Single muted row for source provenance + template binding + metadata actions. */
export function ArticleHeaderTopline({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
