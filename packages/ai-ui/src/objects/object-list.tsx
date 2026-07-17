"use client";

import type { ObjectRef } from "@engenty/ai-core/browser";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  Link2,
  MoreVertical,
  PanelRight,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Shared chrome for object widgets. Every module card renders the same frame,
 * row and footer, so they live here once — a module widget should only have to
 * say what a row *contains*, not how a card looks or what its menu does.
 */

export interface ObjectRowAction {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  onSelect: () => void;
  /** Renders below a separator, for destructive or secondary actions. */
  separated?: boolean;
}

/** Raised card frame — the app's low-elevation list-group chrome. */
export function ObjectCardFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ui-canvas-raised my-1 w-full overflow-hidden rounded-lg border-0 bg-card",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ObjectRowList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border/50">{children}</div>;
}

/** "+N more · open <module>" — shown when refs are capped or a subset. */
export function ObjectListFooter({
  href,
  overflow,
  shown,
  total,
  label,
}: {
  href: string;
  /** Refs beyond the inline cap. */
  overflow: number;
  /** Refs rendered in this card. */
  shown: number;
  /** Total matches upstream, when the refs are a subset. */
  total?: number;
  /** Module noun, e.g. "contacts". */
  label: string;
}) {
  const isSubset = typeof total === "number" && total > shown;
  if (overflow <= 0 && !isSubset) {
    return null;
  }
  return (
    <Link
      className="block border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted/40 hover:text-foreground"
      to={href}
    >
      {overflow > 0 ? `+${overflow} more · ` : ""}
      {isSubset ? `${shown} of ${total} — open ${label}` : `open ${label}`}
    </Link>
  );
}

function copyLink(href: string) {
  const url =
    typeof window === "undefined"
      ? href
      : new URL(href, window.location.origin).toString();
  void navigator.clipboard?.writeText(url);
}

function ObjectRowMenu({
  actions,
  href,
  onOpenInPanel,
}: {
  actions?: ObjectRowAction[];
  href?: string;
  onOpenInPanel?: () => void;
}) {
  const builtIn: ObjectRowAction[] = [];
  if (onOpenInPanel) {
    builtIn.push({
      icon: PanelRight,
      label: "Open in side panel",
      onSelect: onOpenInPanel,
    });
  }
  if (href) {
    builtIn.push({
      icon: SquareArrowOutUpRight,
      label: "Open full page",
      onSelect: () => window.open(href, "_self"),
    });
    builtIn.push({
      icon: Link2,
      label: "Copy link",
      onSelect: () => copyLink(href),
    });
  }
  const items = [...builtIn, ...(actions ?? [])];
  if (items.length === 0) {
    return null;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Actions"
          className="size-7 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
          onClick={(event) => {
            // The whole row is a link; the menu must not navigate.
            event.preventDefault();
            event.stopPropagation();
          }}
          size="sm"
          variant="ghost"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {items.map((action, index) => (
          <div key={action.label}>
            {action.separated && index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                action.onSelect();
              }}
            >
              {action.icon ? <action.icon className="mr-2 size-3.5" /> : null}
              {action.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ObjectListRowProps {
  /** Extra module-specific menu entries, appended after the built-ins. */
  actions?: ObjectRowAction[];
  href?: string;
  /** Avatar or icon. */
  media?: ReactNode;
  /** Right-aligned secondary facts (due date, amount, …). */
  meta?: ReactNode;
  objectRef?: ObjectRef;
  onOpenInPanel?: (ref: ObjectRef) => void;
  subtitle?: ReactNode;
  title: ReactNode;
  /** Status badges etc., rendered before the actions menu. */
  trailing?: ReactNode;
}

export function ObjectListRow({
  actions,
  href,
  media,
  meta,
  objectRef,
  onOpenInPanel,
  subtitle,
  title,
  trailing,
}: ObjectListRowProps) {
  const openInPanel =
    onOpenInPanel && objectRef ? () => onOpenInPanel(objectRef) : undefined;

  const body = (
    <>
      {media ? <div className="shrink-0">{media}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground/90 text-sm">
            {title}
          </span>
        </div>
        {subtitle ? (
          <div className="truncate text-muted-foreground text-xs">
            {subtitle}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="shrink-0 text-muted-foreground text-xs">{meta}</div>
      ) : null}
      {trailing}
      <ObjectRowMenu
        actions={actions}
        href={href}
        onOpenInPanel={openInPanel}
      />
    </>
  );

  const className =
    "group/row flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40";

  if (!href) {
    return <div className={className}>{body}</div>;
  }
  return (
    <Link className={className} to={href}>
      {body}
    </Link>
  );
}
