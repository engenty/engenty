import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

export interface ContactChooserProps {
  className?: string;
  disabled?: boolean;
  entities: { id: string; display_name: string }[];
  onChange: (id: string | null) => void;
  placeholder?: string;
  value: string | null;
}

const NONE_VALUE = "__none__";

export function ContactChooser({
  value,
  onChange,
  entities,
  placeholder,
  className,
  disabled = false,
}: ContactChooserProps) {
  const { t } = useTranslation("contacts");
  const [open, setOpen] = useState(false);

  const displayValue =
    value === null || value === NONE_VALUE ? NONE_VALUE : value;
  const selectedEntity = entities.find((e) => e.id === displayValue);

  const handleSelect = (id: string) => {
    onChange(id === NONE_VALUE ? null : id);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selectedEntity &&
              displayValue === NONE_VALUE &&
              "text-muted-foreground",
            className
          )}
          disabled={disabled}
          role="combobox"
          variant="outline"
        >
          {selectedEntity?.display_name ?? t("noEntities")}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Command shouldFilter>
          <CommandInput placeholder={placeholder ?? t("searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("noEntities")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => handleSelect(NONE_VALUE)}
                value={NONE_VALUE}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    displayValue === NONE_VALUE ? "opacity-100" : "opacity-0"
                  )}
                />
                {t("noEntities")}
              </CommandItem>
              {entities.map((entity) => (
                <CommandItem
                  key={entity.id}
                  keywords={[entity.id]}
                  onSelect={() => handleSelect(entity.id)}
                  value={entity.display_name}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      displayValue === entity.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {entity.display_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
