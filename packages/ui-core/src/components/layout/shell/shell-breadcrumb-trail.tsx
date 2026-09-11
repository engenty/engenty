"use client";

import type { ReactElement, ReactNode } from "react";

import { useUiCoreMediaQuery } from "../../../hooks/useUiCoreMediaQuery";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";
import {
  ShellBreadcrumbPlainText,
  type ShellBreadcrumbPlainTextMode,
} from "./shell-breadcrumb-plain-text";

/** One segment in the shell top bar breadcrumb (label may be text or a small control). */
export interface ShellBreadcrumbItem {
  compactKept?: boolean;
  compactLabel?: ReactNode;
  /** Root segment: icon replaces visible text; pair with {@link tooltip} / {@link menuLabel}. */
  icon?: ReactNode;
  label: ReactNode;
  menuLabel?: string;
  to?: string;
  tooltip?: string;
}

export type ShellBreadcrumbRenderLink = (props: {
  to: string;
  className?: string;
  children: ReactNode;
}) => ReactElement;

export type ShellBreadcrumbVariant = "scroll" | "truncate";

export type ShellBreadcrumbTruncateOverflow = "clip" | "scroll";

export type ShellBreadcrumbTruncateEllipsis = ShellBreadcrumbPlainTextMode;

export interface ShellBreadcrumbCompactOptions {
  /**
   * When this media query matches, the trail uses a compact layout (root icon + overflow menu).
   * Default: (max-width: 639px).
   */
  mediaQuery?: string;
  /** Accessible label for the "…" overflow trigger. */
  overflowMenuAriaLabel?: string;
}

export interface ShellBreadcrumbTrailProps {
  "aria-label"?: string;
  className?: string;
  /**
   * Narrow layouts: first segment uses `compactLabel` (or default icon), intermediate
   * parents collapse into a "…" menu (Google Drive–style). Pass `true` for defaults.
   */
  compact?: boolean | ShellBreadcrumbCompactOptions;
  items: ShellBreadcrumbItem[];
  renderLink: ShellBreadcrumbRenderLink;
  truncateEllipsis?: ShellBreadcrumbTruncateEllipsis;
  truncateOverflow?: ShellBreadcrumbTruncateOverflow;
  variant?: ShellBreadcrumbVariant;
}

function segmentKey(
  item: ShellBreadcrumbItem,
  index: number,
  isLast: boolean
): string {
  const labelStr =
    typeof item.label === "string" || typeof item.label === "number"
      ? String(item.label)
      : "node";
  return `${labelStr}-${item.to ?? (isLast ? "current" : "nohref")}-${index}`;
}

function isPrimitiveLabel(label: ReactNode): label is string | number {
  return typeof label === "string" || typeof label === "number";
}

function breadcrumbScreenReaderTitle(item: ShellBreadcrumbItem): string {
  if (item.menuLabel) {
    return item.menuLabel;
  }
  if (item.tooltip) {
    return item.tooltip;
  }
  if (typeof item.label === "string") {
    return item.label;
  }
  if (typeof item.label === "number") {
    return String(item.label);
  }
  return "Breadcrumb";
}

function breadcrumbRootTooltipText(item: ShellBreadcrumbItem): string {
  return (
    item.tooltip ??
    item.menuLabel ??
    (typeof item.label === "string" ? item.label : "")
  );
}

function breadcrumbMenuLabel(item: ShellBreadcrumbItem, index: number): string {
  if (item.menuLabel) {
    return item.menuLabel;
  }
  if (typeof item.label === "string") {
    return item.label;
  }
  if (typeof item.label === "number") {
    return String(item.label);
  }
  return `— ${index + 1}`;
}

/** Indices collapsed into the compact "…" menu (excluding root, tail, and `compactKept`). */
export function computeShellBreadcrumbCompactCollapsed(
  items: ShellBreadcrumbItem[]
): number[] {
  const n = items.length;
  if (n <= 2) {
    return [];
  }
  const always = new Set<number>([0, n - 2, n - 1]);
  for (let i = 0; i < n; i++) {
    if (items[i].compactKept) {
      always.add(i);
    }
  }
  const collapsed: number[] = [];
  for (let i = 1; i <= n - 2; i++) {
    if (!always.has(i)) {
      collapsed.push(i);
    }
  }
  return collapsed;
}

type CompactChunk =
  | { kind: "item"; index: number }
  | { kind: "ellipsis"; indices: number[] };

function buildCompactChunks(items: ShellBreadcrumbItem[]): CompactChunk[] {
  const n = items.length;
  const collapsed = computeShellBreadcrumbCompactCollapsed(items);
  if (collapsed.length === 0) {
    return items.map((_, i) => ({ kind: "item" as const, index: i }));
  }
  const collapsedSet = new Set(collapsed);
  const chunks: CompactChunk[] = [{ kind: "item", index: 0 }];
  let ellipsisInserted = false;
  for (let i = 1; i < n; i++) {
    if (collapsedSet.has(i)) {
      if (!ellipsisInserted) {
        chunks.push({ kind: "ellipsis", indices: collapsed });
        ellipsisInserted = true;
      }
    } else {
      chunks.push({ kind: "item", index: i });
    }
  }
  return chunks;
}

function listClass(
  variant: ShellBreadcrumbVariant,
  truncateOverflow: ShellBreadcrumbTruncateOverflow
): string {
  const base =
    "m-0 list-none flex flex-nowrap items-center gap-1 p-0 py-0.5 text-sm";
  if (variant === "scroll") {
    return cn(base, "w-max max-w-none");
  }
  if (truncateOverflow === "scroll") {
    return cn(base, "w-max min-w-full");
  }
  return cn(base, "min-w-0 max-w-full overflow-x-clip");
}

function itemClass(
  variant: ShellBreadcrumbVariant,
  primitive: boolean,
  isLast: boolean,
  truncateOverflow: ShellBreadcrumbTruncateOverflow
): string {
  if (variant === "scroll") {
    return "flex shrink-0 items-center gap-1";
  }
  if (primitive) {
    if (truncateOverflow === "scroll") {
      return "flex min-w-0 shrink-0 items-center gap-1";
    }
    if (isLast) {
      return "flex min-w-0 flex-1 basis-0 items-center gap-1";
    }
    return "flex min-w-0 shrink items-center gap-1";
  }
  if (truncateOverflow === "clip") {
    // Shrink-wrap custom controls (space switcher, KB picker). `w-full` on
    // the inner label used to stretch this li to the 16rem cap, leaving a
    // hole between the control and the `/` that follows it.
    return "flex w-max min-w-0 max-w-[min(16rem,45vw)] shrink-0 items-center gap-1";
  }
  return "flex min-w-0 shrink-0 items-center gap-1";
}

function linkClass(variant: ShellBreadcrumbVariant): string {
  return cn(
    "text-muted-foreground transition-colors hover:text-foreground",
    variant === "scroll"
      ? "whitespace-nowrap"
      : "min-w-0 flex-1 basis-0 overflow-hidden text-left"
  );
}

function currentClass(variant: ShellBreadcrumbVariant): string {
  return cn(
    "flex min-w-0 items-center font-medium text-foreground",
    variant === "scroll"
      ? "whitespace-nowrap"
      : "w-full min-w-0 overflow-hidden"
  );
}

/** Custom crumb controls (space switcher, pickers) must shrink-wrap. */
function customLabelClass(variant: ShellBreadcrumbVariant): string {
  return cn(
    "flex min-w-0 items-center",
    variant === "scroll" ? "whitespace-nowrap" : "overflow-hidden"
  );
}

const BREADCRUMB_SLASH_CLASS =
  // Same token as the topbar's own slash (`text-border`): one separator colour.
  "inline-flex shrink-0 select-none items-center leading-none text-border";

function navClass(
  variant: ShellBreadcrumbVariant,
  truncateOverflow: ShellBreadcrumbTruncateOverflow,
  className: string | undefined
): string {
  return cn(
    "min-w-0",
    variant === "truncate" &&
      (truncateOverflow === "scroll"
        ? "max-w-full touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain"
        : "max-w-full overflow-x-clip"),
    className
  );
}

function renderLabelNode(
  item: ShellBreadcrumbItem,
  variant: ShellBreadcrumbVariant,
  truncateMode: ShellBreadcrumbTruncateOverflow,
  ellipsisMode: ShellBreadcrumbPlainTextMode
): ReactNode {
  const primitive = isPrimitiveLabel(item.label);
  if (primitive) {
    if (variant === "scroll" || truncateMode === "scroll") {
      return <span className="block whitespace-nowrap">{item.label}</span>;
    }
    return (
      <ShellBreadcrumbPlainText
        mode={ellipsisMode}
        nativeTitle={item.tooltip}
        text={String(item.label)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center",
        variant === "scroll"
          ? "whitespace-nowrap"
          : "overflow-hidden [&_[data-slot=select-trigger]]:min-w-0 [&_[data-slot=select-trigger]]:max-w-full"
      )}
    >
      {item.label}
    </span>
  );
}

export function ShellBreadcrumbTrail({
  items,
  renderLink,
  variant = "scroll",
  truncateOverflow = "scroll",
  truncateEllipsis = "end",
  compact = false,
  className,
  "aria-label": ariaLabel = "Breadcrumb",
}: ShellBreadcrumbTrailProps) {
  const compactOpts: ShellBreadcrumbCompactOptions | null =
    compact === true ? {} : compact === false ? null : compact;

  const compactMq = compactOpts?.mediaQuery ?? "(max-width: 639px)";
  const mqMatches = useUiCoreMediaQuery(
    compactOpts == null ? "(min-width: 0)" : compactMq
  );
  const compactActive = compactOpts != null && mqMatches;

  const truncateMode: ShellBreadcrumbTruncateOverflow =
    variant === "truncate" ? truncateOverflow : "clip";

  const ellipsisMode: ShellBreadcrumbPlainTextMode =
    variant === "truncate" && truncateMode === "clip"
      ? truncateEllipsis
      : "end";

  const overflowAria =
    compactOpts?.overflowMenuAriaLabel ?? "Show earlier steps";

  if (items.length === 0) {
    return null;
  }

  const wrapWithTooltipProvider = (node: ReactElement) => (
    <TooltipProvider delayDuration={400}>{node}</TooltipProvider>
  );

  if (compactActive && compactOpts) {
    const chunks = buildCompactChunks(items);
    const lastChunkIndex = chunks.length - 1;
    const trailCrowded = items.length > 2;

    return wrapWithTooltipProvider(
      <nav
        aria-label={ariaLabel}
        className={navClass(variant, truncateMode, className)}
        data-trail-crowded={trailCrowded ? "true" : undefined}
      >
        <ol className={listClass(variant, truncateMode)}>
          {chunks.map((chunk, chunkIndex) => {
            const chunkIsLast = chunkIndex === lastChunkIndex;
            if (chunk.kind === "ellipsis") {
              return (
                <li className="flex shrink-0 items-center gap-1" key="ellipsis">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={overflowAria}
                        className="h-8 px-2 font-medium text-muted-foreground hover:text-foreground"
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        ···
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-w-[min(24rem,85vw)]"
                    >
                      {chunk.indices.map((itemIndex) => {
                        const item = items[itemIndex];
                        const label = breadcrumbMenuLabel(item, itemIndex);
                        if (item.to) {
                          return (
                            <DropdownMenuItem
                              className="p-0 focus:bg-transparent"
                              key={itemIndex}
                            >
                              {renderLink({
                                to: item.to,
                                className:
                                  "flex w-full cursor-pointer select-none rounded-sm px-2 py-1.5 text-sm text-popover-foreground outline-none focus:bg-accent focus:text-accent-foreground",
                                children: label,
                              })}
                            </DropdownMenuItem>
                          );
                        }
                        return (
                          <DropdownMenuItem
                            className="opacity-100"
                            disabled
                            key={itemIndex}
                          >
                            {label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {chunkIsLast ? null : (
                    <span aria-hidden className={BREADCRUMB_SLASH_CLASS}>
                      /
                    </span>
                  )}
                </li>
              );
            }

            const index = chunk.index;
            const item = items[index];
            const isLastItem = index === items.length - 1;
            const key = segmentKey(item, index, isLastItem);

            const isFirst = index === 0;
            const rootVisual = item.compactLabel ?? item.icon;
            const rootTip = item.icon ? breadcrumbRootTooltipText(item) : "";
            const labelNode = renderLabelNode(
              item,
              variant,
              truncateMode,
              ellipsisMode
            );

            const primitive =
              isPrimitiveLabel(item.label) && !(isFirst && rootVisual);

            const wrapRootTip = (node: ReactElement) =>
              rootTip ? (
                <Tooltip>
                  <TooltipTrigger asChild>{node}</TooltipTrigger>
                  <TooltipContent side="bottom">{rootTip}</TooltipContent>
                </Tooltip>
              ) : (
                node
              );

            const hasCustomLabel =
              isFirst && !isPrimitiveLabel(item.label) && Boolean(rootVisual);

            const content =
              isFirst &&
              item.to &&
              (rootVisual || isPrimitiveLabel(item.label)) ? (
                wrapRootTip(
                  renderLink({
                    to: item.to,
                    className: rootVisual
                      ? "inline-flex size-8 shrink-0 items-center justify-center rounded-md p-0 text-foreground hover:bg-accent/80"
                      : linkClass(variant),
                    children: rootVisual ? (
                      <>
                        <span className="sr-only">
                          {breadcrumbScreenReaderTitle(item)}
                        </span>
                        {rootVisual}
                      </>
                    ) : (
                      labelNode
                    ),
                  })
                )
              ) : isFirst && !item.to ? (
                rootVisual ? (
                  wrapRootTip(
                    <div
                      className={cn(
                        currentClass(variant),
                        "inline-flex size-8 shrink-0 items-center justify-center"
                      )}
                    >
                      <span className="sr-only">
                        {breadcrumbScreenReaderTitle(item)}
                      </span>
                      {rootVisual}
                    </div>
                  )
                ) : (
                  <div
                    className={
                      isPrimitiveLabel(item.label)
                        ? currentClass(variant)
                        : customLabelClass(variant)
                    }
                  >
                    {labelNode}
                  </div>
                )
              ) : item.to && !isLastItem && isPrimitiveLabel(item.label) ? (
                renderLink({
                  to: item.to,
                  className: linkClass(variant),
                  children: labelNode,
                })
              ) : (
                <div
                  className={
                    isPrimitiveLabel(item.label)
                      ? currentClass(variant)
                      : customLabelClass(variant)
                  }
                >
                  {labelNode}
                </div>
              );

            return (
              <li
                className={itemClass(
                  variant,
                  hasCustomLabel ? false : primitive,
                  isLastItem,
                  truncateMode
                )}
                key={key}
              >
                {content}
                {hasCustomLabel && (
                  <span
                    className={cn(
                      "inline-flex min-w-0 max-w-full items-center",
                      variant === "scroll"
                        ? "whitespace-nowrap"
                        : "overflow-hidden"
                    )}
                  >
                    {item.label}
                  </span>
                )}
                {chunkIsLast ? null : (
                  <span aria-hidden className={BREADCRUMB_SLASH_CLASS}>
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return wrapWithTooltipProvider(
    <nav
      aria-label={ariaLabel}
      className={navClass(variant, truncateMode, className)}
      data-trail-crowded={items.length > 2 ? "true" : undefined}
    >
      <ol className={listClass(variant, truncateMode)}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const key = segmentKey(item, index, isLast);
          const rootIcon = index === 0 && item.icon;
          const primitive = isPrimitiveLabel(item.label) && !rootIcon;

          const label = renderLabelNode(
            item,
            variant,
            truncateMode,
            ellipsisMode
          );

          if (rootIcon) {
            const tip = breadcrumbRootTooltipText(item);
            const srTitle = breadcrumbScreenReaderTitle(item);
            const iconBody = (
              <>
                <span className="sr-only">{srTitle}</span>
                {item.icon}
              </>
            );
            // Module root icon stays a link when `to` is set even on the last crumb
            // (e.g. KB picker is the only segment — label is the switcher, not a link).
            const core = item.to ? (
              renderLink({
                to: item.to,
                className:
                  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground",
                children: iconBody,
              })
            ) : (
              <div
                className={cn(
                  currentClass(variant),
                  "inline-flex size-8 shrink-0 items-center justify-center"
                )}
              >
                {iconBody}
              </div>
            );
            const wrapped =
              tip.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>{core}</TooltipTrigger>
                  <TooltipContent side="bottom">{tip}</TooltipContent>
                </Tooltip>
              ) : (
                core
              );

            // When the label is a custom element (e.g. a KB picker dropdown),
            // render it alongside the icon rather than hiding it.
            const hasCustomLabel = !isPrimitiveLabel(item.label);

            return (
              <li
                className={itemClass(variant, false, isLast, truncateMode)}
                key={key}
              >
                {wrapped}
                {hasCustomLabel && (
                  <span
                    className={cn(
                      "inline-flex min-w-0 max-w-full items-center",
                      variant === "scroll"
                        ? "whitespace-nowrap"
                        : "overflow-hidden"
                    )}
                  >
                    {item.label}
                  </span>
                )}
                {isLast ? null : (
                  <span aria-hidden className={BREADCRUMB_SLASH_CLASS}>
                    /
                  </span>
                )}
              </li>
            );
          }

          return (
            <li
              className={itemClass(variant, primitive, isLast, truncateMode)}
              key={key}
            >
              {item.to && !isLast && isPrimitiveLabel(item.label) ? (
                renderLink({
                  to: item.to,
                  className: linkClass(variant),
                  children: label,
                })
              ) : (
                <div
                  className={
                    primitive
                      ? currentClass(variant)
                      : customLabelClass(variant)
                  }
                >
                  {label}
                </div>
              )}
              {isLast ? null : (
                <span aria-hidden className={BREADCRUMB_SLASH_CLASS}>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
