import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

export interface ChatModelChooserOption {
  badgeLabel?: string;
  description?: string;
  group: string;
  groupLabel: string;
  keywords?: string;
  label: string;
  value: string;
}

interface ChatModelChooserProps {
  activeModelId: string;
  ariaLabel: string;
  disabled?: boolean;
  emptyMessage: string;
  onModelChange: (modelId: string) => void;
  options: ChatModelChooserOption[];
  searchPlaceholder: string;
}

export function ChatModelChooser({
  activeModelId,
  ariaLabel,
  disabled,
  emptyMessage,
  onModelChange,
  options,
  searchPlaceholder,
}: ChatModelChooserProps) {
  const [open, setOpen] = useState(false);
  const activeOption = options.find((option) => option.value === activeModelId);

  const groups: Array<{ label: string; options: ChatModelChooserOption[] }> =
    [];
  for (const option of options) {
    const existing = groups.find((group) => group.label === option.groupLabel);
    if (existing) {
      existing.options.push(option);
    } else {
      groups.push({ label: option.groupLabel, options: [option] });
    }
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className="flex h-6 max-w-[13rem] items-center gap-1 rounded-full border-0 bg-transparent px-2 text-muted-foreground text-xs shadow-none outline-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
      >
        <span className="truncate">{activeOption?.label ?? activeModelId}</span>
        <ChevronDown className="size-3 shrink-0 opacity-70" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
      >
        <Command shouldFilter>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-80">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup heading={group.label} key={group.label}>
                {group.options.map((option) => (
                  <CommandItem
                    className="items-start py-2"
                    key={option.value}
                    onSelect={() => {
                      onModelChange(option.value);
                      setOpen(false);
                    }}
                    value={[option.label, option.keywords]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Check
                      className={
                        option.value === activeModelId
                          ? "mt-0.5 mr-2 size-4 shrink-0 opacity-100"
                          : "mt-0.5 mr-2 size-4 shrink-0 opacity-0"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate leading-tight">
                          {option.label}
                        </span>
                        {option.badgeLabel ? (
                          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground leading-none">
                            {option.badgeLabel}
                          </span>
                        ) : null}
                      </div>
                      {option.description ? (
                        <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                          {option.description}
                        </p>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
