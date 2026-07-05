import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Calendar,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Pencil } from "lucide-react";
import { useState } from "react";
import type { OfferEditIconPosition } from "./offer-text-field.js";

export interface OfferDatePreset {
  id: string;
  label: string;
  resolveDate: () => Date;
}

interface OfferDateFieldProps {
  disabled?: boolean;
  /** Where the hover pencil appears relative to the value text. */
  editIconPosition?: OfferEditIconPosition;
  fallbackLabel?: string;
  onChange: (date: string | null) => void;
  presets?: OfferDatePreset[];
  value: string | null | undefined;
}

function formatIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function OfferDateField({
  value,
  onChange,
  disabled,
  fallbackLabel = "-",
  presets = [],
  editIconPosition = "after",
}: OfferDateFieldProps) {
  const [open, setOpen] = useState(false);
  const { i18n } = useTranslation("offers");
  const date = value ? new Date(value) : null;
  const displayText = date
    ? new Intl.DateTimeFormat(
        i18n.language?.startsWith("de") ? "de-AT" : "en-GB"
      ).format(date)
    : fallbackLabel;

  const handleSelect = (next: Date | undefined) => {
    if (!next) {
      return;
    }
    onChange(formatIsoDateLocal(next));
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className={
            editIconPosition === "before"
              ? "group/date -mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
              : "group/date relative -mx-1 cursor-pointer rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          }
          disabled={disabled}
          type="button"
        >
          {!disabled && editIconPosition === "before" ? (
            <Pencil
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/date:opacity-100"
            />
          ) : null}
          <span className="font-medium text-foreground">{displayText}</span>
          {!disabled && editIconPosition === "after" ? (
            <Pencil className="absolute top-1/2 -right-5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/date:opacity-100" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          autoFocus
          mode="single"
          onSelect={(d) => handleSelect(d ?? undefined)}
          selected={date ?? undefined}
        />
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t p-2">
            {presets.map((preset) => (
              <Button
                key={preset.id}
                onClick={() => {
                  onChange(formatIsoDateLocal(preset.resolveDate()));
                  setOpen(false);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
