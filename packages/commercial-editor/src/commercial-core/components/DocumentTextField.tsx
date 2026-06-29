import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";

interface DocumentTextFieldProps {
  /** i18n key for description */
  descriptionKey?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  /** Placeholder for the input */
  placeholder?: string;
  /** i18n key for title (e.g. "invoices.settings.editServicePeriod") */
  titleKey?: string;
  value: string | null;
}

/**
 * Inline text field with dashed-border trigger and pencil icon on hover.
 * Shared by offer (reference) and invoice (service period).
 */
export function DocumentTextField({
  value,
  onChange,
  disabled,
  titleKey = "offers.settings.editReference",
  descriptionKey = "offers.settings.editReferenceDescription",
  placeholder,
}: DocumentTextFieldProps) {
  const { t } = useTranslation("offers");
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? "");

  useEffect(() => {
    if (open) {
      setInputValue(value ?? "");
    }
  }, [open, value]);

  const handleSave = () => {
    const trimmed = inputValue.trim();
    onChange(trimmed || null);
    setOpen(false);
  };

  const displayText = value?.trim() || "—";

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className="group/ref relative -mx-1 cursor-pointer rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          type="button"
        >
          <span className="font-medium text-foreground">{displayText}</span>
          {!disabled && (
            <Pencil className="absolute top-1/2 -right-5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/ref:opacity-100" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3" sideOffset={4}>
        <Button
          className="absolute top-1 right-1 h-6 w-6"
          onClick={() => setOpen(false)}
          size="icon"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <div className="space-y-3 pr-6">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">{t(titleKey)}</h4>
            <p className="text-muted-foreground text-xs">{t(descriptionKey)}</p>
          </div>
          <Input
            className="text-sm"
            disabled={disabled}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            value={inputValue}
          />
          <div className="flex justify-end">
            <Button className="h-7 px-2" onClick={handleSave} size="sm">
              <Check className="mr-1 h-3.5 w-3.5" />
              {t("common.save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
