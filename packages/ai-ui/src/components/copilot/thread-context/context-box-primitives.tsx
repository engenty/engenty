"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

export function ContextBox({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={ariaLabel}
      className={cn(
        "ui-card-elevated flex max-h-[min(60vh,480px)] w-full flex-col overflow-hidden text-card-foreground",
        className
      )}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1.5 py-2.5">
        {children}
      </div>
    </aside>
  );
}

/**
 * Group heading, drawn the way the space sidebar draws its section headings:
 * the label is a label, and collapsing is a chevron button sitting right after
 * it — not a full-width trigger that lights up under the pointer.
 */
export function ContextBoxSection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div className="mb-1 flex items-center gap-1 px-2">
        <p className="min-w-0 truncate font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </p>
        <CollapsibleTrigger
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          )}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 transition-transform",
              open ? "" : "-rotate-90"
            )}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-0.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

const rowClassName =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-muted/70";

const rowIconClassName = "size-3.5 shrink-0 text-muted-foreground/70";

export function ContextBoxRow({
  detail,
  externalUrl,
  href,
  icon: Icon,
  label,
  onClick,
}: {
  detail?: ReactNode;
  externalUrl?: string;
  href?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Icon aria-hidden className={rowIconClassName} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="max-w-[55%] shrink-0 truncate text-muted-foreground text-xs">
          {detail}
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button className={rowClassName} onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  if (href) {
    return (
      <Link className={rowClassName} to={href}>
        {content}
      </Link>
    );
  }
  if (externalUrl) {
    return (
      <a
        className={rowClassName}
        href={externalUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }
  return <div className={rowClassName}>{content}</div>;
}
