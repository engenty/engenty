"use client";

import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@engenty/ui-core";
import { ChevronDown, X } from "lucide-react";
import { useRef, useState } from "react";

function typeToLabel(type: string): string {
  return type.split(".").pop() ?? type;
}

interface AuditLogTypeSelectorProps {
  className?: string;
  label?: string;
  onChange: (types: string[]) => void;
  options: string[];
  placeholder?: string;
  value: string[];
}

export function AuditLogTypeSelector({
  options,
  value,
  onChange,
  placeholder = "Select types...",
  label = "Type",
  className,
}: AuditLogTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = value;
  const selectedSet = new Set(selected);

  const handleToggle = (type: string) => {
    if (selectedSet.has(type)) {
      const next = selected.filter((t) => t !== type);
      onChange(next.length > 0 ? next : []);
    } else {
      onChange([...selected, type]);
    }
  };

  const handleUnselect = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    const next = selected.filter((t) => t !== type);
    onChange(next.length > 0 ? next : []);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const filtered =
    search.trim() === ""
      ? options
      : options.filter((t) => t.toLowerCase().includes(search.toLowerCase()));

  return (
    <Popover
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && eventDetails.reason === "outside-press") {
          const target = eventDetails.event.target as Element | null;
          if (
            target?.hasAttribute("cmdk-input") ||
            target?.closest("[data-layout=type-selector-wrapper]")
          ) {
            eventDetails.cancel();
            return;
          }
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <Command
        className="h-auto overflow-visible bg-transparent"
        onKeyDown={handleKeyDown}
        shouldFilter={false}
      >
        <PopoverAnchor asChild>
          <div
            className={`flex min-w-[160px] max-w-[280px] cursor-pointer items-center justify-between gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:bg-accent/5${className ? ` ${className}` : ""}`}
            data-layout="type-selector-wrapper"
            onClick={() => setOpen(!open)}
            ref={wrapperRef}
          >
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((type) => (
                  <Badge
                    className="gap-0.5 py-0 pr-0.5 font-normal text-xs"
                    key={type}
                    variant="secondary"
                  >
                    {typeToLabel(type)}
                    <button
                      aria-label={`Remove ${typeToLabel(type)}`}
                      className="ml-0.5 rounded-full p-0.5 outline-none ring-offset-background hover:bg-muted focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      onClick={(e) => handleUnselect(e, type)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleUnselect(e as never, type);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--anchor-width) p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CommandInput
            className="h-8 border-0 text-xs"
            onValueChange={setSearch}
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
          />
          <CommandList className="max-h-[220px]">
            <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
              No types found.
            </CommandEmpty>
            {/* Dummy item to prevent cmdk from auto-selecting first option on open */}
            <CommandItem className="hidden" value="-" />
            <CommandGroup heading={label}>
              {filtered.map((type) => {
                const isSelected = selectedSet.has(type);
                return (
                  <CommandItem
                    className="cursor-pointer text-xs"
                    key={type}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onSelect={() => handleToggle(type)}
                    value={type}
                  >
                    <span className="flex-1 capitalize">
                      {typeToLabel(type)}
                    </span>
                    {isSelected ? (
                      <span className="text-primary">✓</span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
