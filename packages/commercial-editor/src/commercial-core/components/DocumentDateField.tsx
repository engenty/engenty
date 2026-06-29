import { useTranslation } from "@engenty/i18n/ui";
import {
  Calendar,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Pencil } from "lucide-react";
import { useState } from "react";

interface DocumentDateFieldProps {
  disabled?: boolean;
  fallbackLabel?: string;
  onChange: (date: string | null) => void;
  value: string | null | undefined;
}

/**
 * Inline date field with dashed-border trigger and pencil icon on hover.
 * Shared by offer (Angebotsdatum, Gültig bis) and invoice (Issue Date, Due Date).
 */
export function DocumentDateField({
  value,
  onChange,
  disabled,
  fallbackLabel = "—",
}: DocumentDateFieldProps) {
  const [open, setOpen] = useState(false);
  const { i18n } = useTranslation("offers");
  const dateLocale = i18n.language?.startsWith("de") ? de : undefined;
  const date = value ? new Date(value) : null;

  const displayText = date
    ? format(date, "dd.MM.yyyy", { locale: dateLocale })
    : fallbackLabel;

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onChange(d.toISOString().split("T")[0] ?? null);
      setOpen(false);
    }
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className="group/date relative -mx-1 cursor-pointer rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          type="button"
        >
          <span className="font-medium text-foreground">{displayText}</span>
          {!disabled && (
            <Pencil className="absolute top-1/2 -right-5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/date:opacity-100" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          autoFocus
          locale={dateLocale}
          mode="single"
          onSelect={(d) => handleSelect(d ?? undefined)}
          selected={date ?? undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
