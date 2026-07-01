import { cn } from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Label column — muted, normal weight (values carry the emphasis). */
export const articlePropertyLabelClassName =
  "w-36 shrink-0 text-sm font-normal leading-none text-muted-foreground";

/** Value column base typography for all property rows. */
export const articlePropertyValueColumnClassName =
  "flex min-h-6 min-w-0 flex-1 items-center text-sm font-normal leading-none text-foreground";

export function ArticlePropertyEmpty() {
  return <span className="text-muted-foreground">—</span>;
}

/** Primary value text (dates, names, category path, custom fields). */
export function ArticlePropertyValueText({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("min-w-0", className)} title={title}>
      {children}
    </span>
  );
}

/** Secondary fragment on the same row (e.g. editor name after "·"). */
export function ArticlePropertyValueMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-muted-foreground", className)}>{children}</span>
  );
}

/** Fixed-height chip frame for status/tags property values. */
export const articlePropertyChipClassName =
  "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs leading-none";

/** Darker sunken chip fill on white canvas (paper-3), not the lighter muted wash. */
export const articlePropertyTagChipToneClassName =
  "border-transparent bg-[var(--canvas-darken)] text-foreground dark:bg-secondary dark:text-secondary-foreground";

/** Picker / toggle chips — primary fill on hover. */
export const articlePropertyTagChipHoverClassName =
  "transition-colors hover:border-transparent hover:bg-primary hover:text-primary-foreground";

/** Property row chips — primary when the wide value row is hovered. */
export const articlePropertyTagChipGroupHoverClassName =
  "transition-colors group-hover/val:border-transparent group-hover/val:bg-primary group-hover/val:text-primary-foreground";

/** Full-width value row hover chrome (tags: outline spans column; edit via pencil only). */
export const articlePropertyValueHoverRowClassName =
  "group/val -mx-1 flex h-6 w-full items-center gap-1.5 rounded px-1 hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/40";

/** Pencil-only popover trigger inside a property value hover row. */
export const articlePropertyValueEditButtonClassName =
  "inline-flex h-6 shrink-0 items-center justify-center rounded px-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/val:opacity-60 hover:opacity-100 focus-visible:opacity-100";

/** Interactive value trigger — fixed height avoids row jump on empty ↔ chip swap. */
export const articlePropertyValueTriggerClassName =
  "group/val -mx-1 inline-flex h-6 max-w-full cursor-pointer items-center gap-1.5 rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/40";

export function ArticlePropertyShell({
  className,
  icon: Icon,
  label,
  value,
}: {
  className?: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/row flex min-h-6 items-center gap-2 rounded-md py-0.5 hover:bg-muted/40",
        className
      )}
    >
      <div className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className={articlePropertyLabelClassName}>{label}</span>
      <div className={articlePropertyValueColumnClassName}>{value}</div>
    </div>
  );
}
