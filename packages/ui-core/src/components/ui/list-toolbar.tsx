import { ChevronDown, Search, X, type LucideIcon } from "lucide-react";
import type * as React from "react";
import { useRef } from "react";
import { useListToolbarHotkeys } from "../../hooks/useListToolbarHotkeys";
import { cn } from "../../utils";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Input } from "./input";
import { SelectTrigger } from "./select";

/**
 * Pill-style toolbar controls for search inputs and filter selects that sit
 * above data tables. Border hairline from `ui-canvas-field`; soft lift uses
 * `--shadow-ember-elevated` (ember-primitives).
 *
 * Use a literal `box-shadow` arbitrary property — not `shadow-(--…)` / `shadow-*`
 * with that token: Tailwind’s shadow utilities route through `--tw-shadow*` and
 * resolve to transparent for this multi-layer value.
 */
const PILL_CN =
  "rounded-full border-card h-10 [box-shadow:var(--shadow-ember-elevated)] focus-visible:ring-0";

// ---------------------------------------------------------------------------
// ListSearchInput
// ---------------------------------------------------------------------------

interface ListSearchInputProps extends React.ComponentProps<"input"> {
  /**
   * When false, disables Mod+F / Mod+Shift+F handling for this field.
   * @default true
   */
  enableHotkeys?: boolean;
  /**
   * Opens the expandable filter chip bar (Mod+Shift+F). Pass only when the
   * toolbar has a filter row.
   */
  onOpenFilters?: () => void;
  /** Extra wrapper className (e.g. max-w-sm flex-1). */
  wrapperClassName?: string;
}

function ListSearchInput({
  className,
  wrapperClassName,
  enableHotkeys = true,
  onOpenFilters,
  ref,
  ...props
}: ListSearchInputProps) {
  const localRef = useRef<HTMLInputElement | null>(null);

  useListToolbarHotkeys({
    enabled: enableHotkeys,
    onOpenFilters,
    searchInputRef: localRef,
  });

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className={cn(PILL_CN, "pl-8", className)}
        ref={(node) => {
          localRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        {...props}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListFilterSelectTrigger
// ---------------------------------------------------------------------------

function ListFilterSelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        PILL_CN,
        "pl-4",
        /* SelectTrigger defaults `data-[size=default]:h-8`; beat it for toolbar rhythm */
        "data-[size=default]:h-10 data-[size=default]:min-h-10 data-[size=sm]:h-10 data-[size=sm]:min-h-10",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ListToolbarIconButton
// ---------------------------------------------------------------------------

/**
 * Icon-only button for permanent toolbar controls (e.g. display settings).
 * Borderless by default; on hover shows a subtle accent pill.
 * Always use an aria-label since there is no visible text.
 */
function ListToolbarIconButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        "rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-0",
        className,
      )}
      size="icon-sm"
      variant="ghost"
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ListIconSegmentToggle
// ---------------------------------------------------------------------------

const SEGMENT_SHELL_CN =
  "inline-flex shrink-0 items-center rounded-full border border-card bg-card p-0.5 [box-shadow:var(--shadow-ember-elevated)]";

const SEGMENT_BUTTON_CN =
  "h-8 w-8 shrink-0 rounded-full border-0 shadow-none focus-visible:ring-0";

interface ListIconSegmentToggleSegment<T extends string> {
  icon: LucideIcon;
  label: string;
  value: T;
}

interface ListIconSegmentToggleProps<T extends string> {
  allowDeselect?: boolean;
  "aria-label"?: string;
  className?: string;
  onChange: (value: T | "") => void;
  segments: ListIconSegmentToggleSegment<T>[];
  value: T | "";
}

function ListIconSegmentToggle<T extends string>({
  allowDeselect = false,
  "aria-label": ariaLabel,
  className,
  onChange,
  segments,
  value,
}: ListIconSegmentToggleProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(SEGMENT_SHELL_CN, className)}
      role="group"
    >
      {segments.map((segment) => {
        const isActive = value === segment.value;
        const Icon = segment.icon;
        return (
          <Button
            aria-label={segment.label}
            aria-pressed={isActive}
            className={cn(
              SEGMENT_BUTTON_CN,
              isActive
                ? "bg-accent text-foreground"
                : "bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
            key={segment.value}
            onClick={() =>
              onChange(allowDeselect && isActive ? "" : segment.value)
            }
            type="button"
            variant="ghost"
          >
            <Icon aria-hidden className="size-4" />
          </Button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListFilterChip
// ---------------------------------------------------------------------------

const FILTER_CHIP_CN =
  "h-8 shrink-0 gap-1 rounded-full border px-3 text-sm shadow-none [box-shadow:var(--shadow-ember-elevated)] focus-visible:ring-0";

interface ListFilterChipOption {
  label: string;
  value: string;
}

interface ListFilterChipProps {
  activeLabel?: string;
  ariaLabel: string;
  clearLabel: string;
  isActive: boolean;
  label: string;
  /**
   * When true, options are checkboxes and the menu stays open so several
   * values can be OR'd. Pass `values` / `onValuesChange` instead of `value`.
   */
  multiple?: boolean;
  onClear: () => void;
  onSelect?: (next: string) => void;
  onValuesChange?: (next: string[]) => void;
  options: ListFilterChipOption[];
  value?: string;
  values?: string[];
}

function defaultMultiActiveLabel(
  values: string[],
  options: ListFilterChipOption[]
) {
  return values
    .map(
      (item) => options.find((option) => option.value === item)?.label ?? item
    )
    .join(", ");
}

function ListFilterChip({
  activeLabel,
  ariaLabel,
  clearLabel,
  isActive,
  label,
  multiple = false,
  onClear,
  onSelect,
  onValuesChange,
  options,
  value,
  values = [],
}: ListFilterChipProps) {
  const resolvedActiveLabel =
    activeLabel ??
    (multiple ? defaultMultiActiveLabel(values, options) : undefined);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn(
            FILTER_CHIP_CN,
            isActive
              ? "border-primary/30 bg-accent text-foreground hover:bg-accent"
              : "border-card bg-card text-muted-foreground hover:bg-card hover:text-foreground"
          )}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className="max-w-[12rem] truncate">
            {isActive && resolvedActiveLabel ? resolvedActiveLabel : label}
          </span>
          {isActive ? (
            <span
              aria-label={clearLabel}
              className="inline-flex shrink-0 rounded-sm hover:text-foreground"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  event.preventDefault();
                  onClear();
                }
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onClear();
              }}
              role="button"
              tabIndex={0}
            >
              <X aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          ) : (
            <ChevronDown
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 opacity-70"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {label}
        </DropdownMenuLabel>
        {multiple ? (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              checked={values.includes(option.value)}
              closeOnClick={false}
              key={option.value}
              onCheckedChange={(checked) => {
                const selected = new Set(values);
                if (checked) {
                  selected.add(option.value);
                } else {
                  selected.delete(option.value);
                }
                onValuesChange?.([...selected]);
              }}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuRadioGroup onValueChange={onSelect} value={value}>
            {options.map((option) => (
              <DropdownMenuRadioItem
                closeOnClick
                key={option.value}
                value={option.value}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export {
  ListFilterChip,
  ListFilterSelectTrigger,
  ListIconSegmentToggle,
  ListSearchInput,
  ListToolbarIconButton,
};
export type {
  ListFilterChipProps,
  ListIconSegmentToggleProps,
  ListIconSegmentToggleSegment,
};
