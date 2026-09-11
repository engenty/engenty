import type * as React from "react";

import { cn } from "../../../lib/utils";
import {
  sidebarLeadingIconSlotClassName,
  sidebarRowActionsOverlayClassName,
  sidebarSectionLabelPlAlignToRootRowIconClassName,
  sidebarSectionLabelPlAlignToRowIconClassName,
} from "./sidebar-classes";
import {
  attachSidebarListInsertDropHandlers,
  type SidebarListInsertDropHandlersArgs,
} from "./sidebar-list-insert";
import { SidebarListInsertDropBar } from "./sidebar-list-insert-drop-bar";
import { SidebarMenuButton, SidebarMenuItem } from "./sidebar-primitives";

/** Base left indent (px) for depth 0 sidebar rows — matches KB article tree. */
export const SIDEBAR_ROW_INDENT_BASE_PX = 8;

/** Per-depth indent step (px) — matches KB `8 + depth * 12`. */
export const SIDEBAR_ROW_INDENT_STEP_PX = 12;

/** Row shell horizontal padding (`px-0.5` → 2px each side). */
export const SIDEBAR_ROW_SHELL_HORIZONTAL_PX = 2;

/** {@link sidebarLeadingIconSlotClassName} width (`w-5`). */
export const SIDEBAR_LEADING_ICON_SLOT_WIDTH_PX = 20;

/** Trailing padding on leading icon slot (`pr-1`). */
export const SIDEBAR_LEADING_ICON_SLOT_PADDING_RIGHT_PX = 4;

/** Flex gap between leading column and label (`gap-1`). */
export const SIDEBAR_ROW_INNER_GAP_PX = 4;

/** Extra nest step for icon-less rows under a folder row. */
export const SIDEBAR_ROW_ICONLESS_NEST_STEP_PX = 4;

/** Left padding for a sidebar row at the given tree depth. */
export function sidebarRowPaddingLeftPx(depth = 0): number {
  return SIDEBAR_ROW_INDENT_BASE_PX + depth * SIDEBAR_ROW_INDENT_STEP_PX;
}

/**
 * Left padding when the row has no leading icon column (KB articles under folders).
 * Aligns with sibling categories at the same depth — the icon width is used for the dot.
 */
export function sidebarRowPaddingLeftPxNoLeadingIcon(depth: number): number {
  return sidebarRowPaddingLeftPx(depth);
}

export type SidebarRowIndentVariant = "default" | "noLeadingIcon";

function resolveSidebarRowPaddingLeft(
  depth: number,
  indentVariant: SidebarRowIndentVariant
): number {
  if (indentVariant === "noLeadingIcon") {
    return sidebarRowPaddingLeftPxNoLeadingIcon(depth);
  }
  return sidebarRowPaddingLeftPx(depth);
}

export interface SidebarRowProps
  extends React.ComponentProps<typeof SidebarMenuItem> {
  /** Tree depth; maps to `padding-left` via {@link sidebarRowPaddingLeftPx}. */
  depth?: number;
  /** `noLeadingIcon` — KB article rows without a leading glyph column. */
  indentVariant?: SidebarRowIndentVariant;
  isActive?: boolean;
  /** When set, wires list-insert drop bar + HTML5 DnD handlers on the row shell. */
  listInsertDrop?: SidebarListInsertDropHandlersArgs;
}

/** Outer row shell: `SidebarMenuItem` + Notion-like hover chrome and optional list-insert DnD. */
export function SidebarRow({
  children,
  className,
  depth = 0,
  indentVariant = "default",
  isActive = false,
  listInsertDrop,
  ...props
}: SidebarRowProps) {
  const paddingLeftPx = resolveSidebarRowPaddingLeft(depth, indentVariant);
  const listDrop = listInsertDrop
    ? attachSidebarListInsertDropHandlers(listInsertDrop)
    : null;

  return (
    <SidebarMenuItem className={className} {...props}>
      <div
        className={cn(
          "group relative flex w-full min-w-0 items-center gap-1 rounded-md px-0.5 transition-colors",
          "focus-within:bg-muted/50 hover:bg-muted/50",
          isActive && "font-medium text-foreground"
        )}
        data-slot="sidebar-row"
        style={{ paddingLeft: paddingLeftPx }}
        {...(listDrop
          ? {
              onDragLeave: listDrop.onDragLeave,
              onDragOver: listDrop.onDragOver,
              onDrop: listDrop.onDrop,
            }
          : {})}
      >
        {listDrop?.showInsertBar && listDrop.insertPlace ? (
          <SidebarListInsertDropBar place={listDrop.insertPlace} />
        ) : null}
        {children}
      </div>
    </SidebarMenuItem>
  );
}

export interface SidebarRowLeadingIconProps {
  /**
   * When true (default), the chevron replaces the icon so folders read as
   * expandable at rest. Pass false to keep the glyph and swap the chevron in
   * only on row hover/focus (adapter/source rows that need their identity).
   */
  alwaysShowChevron?: boolean;
  /** Expand/collapse control; shown in place of {@link icon} when present. */
  chevronSlot?: React.ReactNode;
  className?: string;
  /** Default leading icon (e.g. document glyph) when the row is not expandable. */
  icon: React.ReactNode;
}

/** Leading icon column; expandable rows show the chevron in place of the glyph. */
export function SidebarRowLeadingIcon({
  alwaysShowChevron = true,
  chevronSlot,
  className,
  icon,
}: SidebarRowLeadingIconProps) {
  const hasChevron = Boolean(chevronSlot);

  return (
    <div
      className={cn(sidebarLeadingIconSlotClassName, "pr-1", className)}
      data-slot="sidebar-row-leading-icon"
    >
      {hasChevron ? (
        alwaysShowChevron ? (
          <div className="flex items-center justify-center">{chevronSlot}</div>
        ) : (
          <>
            <span
              aria-hidden
              className="pointer-events-none opacity-60 transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
            >
              {icon}
            </span>
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150",
                "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100",
                "group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              )}
            >
              {chevronSlot}
            </div>
          </>
        )
      ) : (
        <span
          aria-hidden
          className="[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg]:opacity-60"
        >
          {icon}
        </span>
      )}
    </div>
  );
}

export type SidebarRowButtonProps = React.ComponentProps<
  typeof SidebarMenuButton
>;

/** Title/label area — `SidebarMenuButton` with tree-row variant (spread-friendly for nav props). */
export function SidebarRowButton({
  className,
  isActive = false,
  variant = "tree",
  ...props
}: SidebarRowButtonProps) {
  return (
    <SidebarMenuButton
      className={className}
      data-slot="sidebar-row-button"
      isActive={isActive}
      variant={variant}
      {...props}
    />
  );
}

export interface SidebarRowActionsProps {
  children: React.ReactNode;
  className?: string;
  /** Keep the actions strip visible (e.g. while a nested menu is open). */
  forceVisible?: boolean;
}

/** Hover-revealed trailing actions overlay (grip, plus, overflow menu, etc.). */
export function SidebarRowActions({
  children,
  className,
  forceVisible = false,
}: SidebarRowActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        sidebarRowActionsOverlayClassName,
        forceVisible && "pointer-events-auto opacity-100",
        className
      )}
      data-slot="sidebar-row-actions"
    >
      {children}
    </div>
  );
}

export interface SidebarSectionLabelProps extends React.ComponentProps<"h3"> {
  /** `root` matches rows with `pl-2`; `nested` matches `px-0.5` row padding. */
  align?: "root" | "nested";
}

/** Section header aligned to leading icon column in dense sidebar trees. */
export function SidebarSectionLabel({
  align = "root",
  children,
  className,
  ...props
}: SidebarSectionLabelProps) {
  return (
    <h3
      className={cn(
        "mb-0.5 font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wide",
        align === "root"
          ? sidebarSectionLabelPlAlignToRootRowIconClassName
          : sidebarSectionLabelPlAlignToRowIconClassName,
        className
      )}
      data-slot="sidebar-section-label"
      {...props}
    >
      {children}
    </h3>
  );
}

/**
 * Standard group heading for secondary-column sidebar lists.
 * Combines `SidebarSectionLabel` with `align="root"` and `pt-4` top spacing
 * so all modules share a consistent heading style without repeating the props.
 */
export function SidebarNavSectionLabel({
  className,
  ...props
}: SidebarSectionLabelProps) {
  return (
    <SidebarSectionLabel
      align="root"
      className={cn("pt-4", className)}
      {...props}
    />
  );
}
