"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useDateLocale } from "../../hooks/use-date-locale.js";
import { formFieldRadiusClassName } from "../../lib/form-field-chrome";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface DatePickerProps {
  className?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Value as ISO date string (yyyy-MM-dd) or null */
  value: string | null | undefined;
}

export function DatePicker({
  value,
  onChange,
  placeholder: placeholderProp,
  disabled = false,
  className,
}: DatePickerProps) {
  const { t } = useTranslation("common");
  const { dateFnsLocale, dayPickerLocale } = useDateLocale();
  const placeholder = placeholderProp ?? t("datePicker.placeholder");
  const date = value ? parseISO(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "h-8 min-h-8 min-w-0 flex-1 justify-start text-left font-normal",
            formFieldRadiusClassName,
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
          variant="outline"
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {date ? (
            format(date, "PPP", { locale: dateFnsLocale })
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        collisionPadding={12}
        side="bottom"
        sideOffset={4}
      >
        <Calendar
          autoFocus
          locale={dayPickerLocale}
          mode="single"
          onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : null)}
          selected={date}
        />
      </PopoverContent>
    </Popover>
  );
}
