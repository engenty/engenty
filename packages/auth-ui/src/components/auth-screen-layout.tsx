import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";

/** Centered auth route canvas shared by login and initial-setup pages. */
export function AuthScreenLayout({
  children,
  message,
}: {
  children?: ReactNode;
  message?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[calc(100dvh-3rem)] items-center justify-center",
        "bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4",
        message && "text-muted-foreground text-sm"
      )}
    >
      {message ?? children}
    </div>
  );
}
