"use client";

/**
 * Shell breadcrumb segment with Notion/Cursor-style hover context panel + optional
 * entity switcher. Shared by KB, chatbot, and other module workspace pickers.
 */

import { ChevronDown } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../../../lib/utils";
import {
  type ContextPopoverFooter,
  type ContextPopoverItem,
  ContextPopoverList,
  type ContextPopoverRenderLink,
  type ContextPopoverSection,
} from "./context-popover-list";

export interface BreadcrumbContextMetaRow {
  icon?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
}

export interface BreadcrumbContextPickerProps {
  className?: string;
  emptyMessage?: string;
  footer?: ContextPopoverFooter;
  /**
   * Show the hover panel even with zero/one switcher items (metadata-only panels).
   * When false, a single item and no meta/footer renders as plain text only.
   */
  forcePopover?: boolean;
  items?: ContextPopoverItem[];
  label: string;
  menuLabel?: string;
  /** Metadata rows under the title (branch, path, slug, etc.). */
  metaRows?: BreadcrumbContextMetaRow[];
  pickerAriaLabel: string;
  popoverClassName?: string;
  renderLink?: ContextPopoverRenderLink;
  sections?: ContextPopoverSection[];
  /** Small uppercase header above the switcher list. */
  switcherSectionLabel?: string;
  title?: string;
  /** When set, the popover title links to this route. */
  titleTo?: string;
}

function BreadcrumbContextPopoverHeader({
  metaRows,
  renderLink,
  title,
  titleTo,
}: {
  metaRows?: BreadcrumbContextMetaRow[];
  renderLink?: ContextPopoverRenderLink;
  title: string;
  titleTo?: string;
}) {
  const titleNode =
    titleTo && renderLink ? (
      renderLink({
        to: titleTo,
        className:
          "block truncate font-semibold text-foreground text-sm transition-colors hover:underline",
        children: title,
      })
    ) : (
      <p className="truncate font-semibold text-foreground text-sm">{title}</p>
    );

  return (
    <div className="space-y-0.5">
      <div className="px-0.5">{titleNode}</div>
      {metaRows?.map((row, index) => (
        <div
          className="flex items-start gap-2.5 px-0.5 py-1"
          key={`${String(row.primary)}-${index}`}
        >
          {row.icon ? (
            <span className="mt-0.5 size-4 shrink-0 text-muted-foreground/70">
              {row.icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-foreground text-sm">{row.primary}</p>
            {row.secondary ? (
              <p className="truncate text-muted-foreground text-xs">
                {row.secondary}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function switcherCount(
  items: ContextPopoverItem[],
  sections?: ContextPopoverSection[]
): number {
  if ((sections?.length ?? 0) > 0) {
    return (
      sections?.reduce((total, section) => total + section.items.length, 0) ?? 0
    );
  }
  return items.length;
}

export function BreadcrumbContextPicker({
  label,
  metaRows,
  items = [],
  sections,
  switcherSectionLabel,
  title,
  titleTo,
  pickerAriaLabel,
  emptyMessage,
  footer,
  renderLink,
  popoverClassName,
  className,
  forcePopover = false,
}: BreadcrumbContextPickerProps): ReactElement {
  const resolvedTitle = title ?? label;
  const count = switcherCount(items, sections);
  const hasMeta = (metaRows?.length ?? 0) > 0;
  const hasSwitcher = count > 0;
  const showPopover =
    forcePopover ||
    hasMeta ||
    count > 1 ||
    footer != null ||
    (sections?.length ?? 0) > 0;

  if (!showPopover) {
    if (titleTo && renderLink) {
      return renderLink({
        to: titleTo,
        className: cn(
          "min-w-0 truncate font-medium text-foreground text-sm transition-colors hover:underline",
          className
        ),
        children: label,
      });
    }
    return (
      <span
        className={cn(
          "min-w-0 truncate font-medium text-foreground text-sm",
          className
        )}
      >
        {label}
      </span>
    );
  }

  const header = (
    <>
      <BreadcrumbContextPopoverHeader
        metaRows={metaRows}
        renderLink={renderLink}
        title={resolvedTitle}
        titleTo={titleTo}
      />
      {hasSwitcher ? (
        <div aria-hidden className="mt-1.5 mb-0.5 h-px bg-border/40" />
      ) : null}
    </>
  );

  const resolvedSections =
    sections ??
    (hasSwitcher && switcherSectionLabel
      ? [
          {
            id: "switcher",
            contextLabel: switcherSectionLabel,
            items,
          },
        ]
      : undefined);

  return (
    <ContextPopoverList
      className={cn("w-72", popoverClassName)}
      contextLabel={
        resolvedSections ? undefined : (switcherSectionLabel ?? undefined)
      }
      emptyMessage={emptyMessage}
      footer={footer}
      header={header}
      items={resolvedSections ? undefined : items}
      openOn="hover"
      renderLink={renderLink}
      sections={resolvedSections}
      trigger={
        <button
          aria-label={pickerAriaLabel}
          className={cn(
            "group/picker inline-flex max-w-[min(20rem,85vw)] items-center gap-0.5 rounded px-0.5 font-medium text-foreground text-sm transition-colors hover:text-foreground",
            className
          )}
          type="button"
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover/picker:opacity-100 group-data-[state=open]/picker:opacity-100"
          />
        </button>
      }
    />
  );
}
