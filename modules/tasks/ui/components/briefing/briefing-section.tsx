// Shared briefing column chrome: a small-caps heading and a footer row that
// only renders when the section has something to do (view-all, clear, create).
import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export const briefingFooterLinkClassName =
  "text-muted-foreground text-xs hover:text-foreground";

export const briefingFooterActionClassName =
  "font-medium text-primary text-xs hover:underline";

export function BriefingSectionHead({ title }: { title: string }) {
  return (
    <h2 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
      {title}
    </h2>
  );
}

export function BriefingSectionFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function BriefingFooterLink({
  children,
  to,
}: {
  children: ReactNode;
  to: string;
}) {
  return (
    <Link className={briefingFooterLinkClassName} to={to}>
      {children}
    </Link>
  );
}

export function BriefingFooterAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={briefingFooterActionClassName}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
