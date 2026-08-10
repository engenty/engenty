"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface SearchableSelectOption {
  badgeLabel?: string;
  description?: string;
  /** Extra classes for the description line (e.g. `font-mono`). */
  descriptionClassName?: string;
  disabled?: boolean;
  keywords?: string;
  label: string;
  value: string;
}

export interface SearchableSelectProps {
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  id?: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  popoverContentClassName?: string;
  searchPlaceholder?: string;
  triggerClassName?: string;
  value: string;
}

function optionSearchValue(option: SearchableSelectOption): string {
  return [
    option.label,
    option.value,
    option.keywords,
    option.description,
    option.badgeLabel,
  ]
    .filter(Boolean)
    .join(" ");
}

function SearchableSelectOptionContent({
  option,
  selected,
}: {
  option: SearchableSelectOption;
  selected: boolean;
}) {
  const hasMeta = Boolean(option.description || option.badgeLabel);

  if (!hasMeta) {
    return (
      <>
        <Check
          className={cn(
            "mr-2 size-4 shrink-0",
            selected ? "opacity-100" : "opacity-0"
          )}
        />
        {option.label}
      </>
    );
  }

  return (
    <>
      <Check
        className={cn(
          "mt-0.5 mr-2 size-4 shrink-0",
          selected ? "opacity-100" : "opacity-0"
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate leading-tight">{option.label}</span>
          {option.badgeLabel ? (
            <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground leading-none">
              {option.badgeLabel}
            </span>
          ) : null}
        </div>
        {option.description ? (
          <p
            className={cn(
              "mt-0.5 text-muted-foreground text-xs leading-snug",
              option.descriptionClassName
            )}
          >
            {option.description}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function SearchableSelect({
  className,
  disabled = false,
  emptyMessage = "No results.",
  id,
  onValueChange,
  options,
  placeholder,
  popoverContentClassName,
  searchPlaceholder = "Search…",
  triggerClassName,
  value,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label ?? (value || null);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-input bg-transparent px-2.5 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
            !displayLabel && "text-muted-foreground",
            triggerClassName,
            className
          )}
          disabled={disabled}
          id={id}
          role="combobox"
          type="button"
        >
          <span className="line-clamp-1 min-w-0 flex-1 text-left">
            {displayLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-(--anchor-width) min-w-[min(100vw-2rem,32rem)] p-0",
          popoverContentClassName
        )}
      >
        <Command shouldFilter>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  className={cn(
                    option.description || option.badgeLabel
                      ? "items-start py-2"
                      : undefined
                  )}
                  disabled={option.disabled}
                  key={option.value}
                  onSelect={() => {
                    if (option.disabled) {
                      return;
                    }
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  value={optionSearchValue(option)}
                >
                  <SearchableSelectOptionContent
                    option={option}
                    selected={value === option.value}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
