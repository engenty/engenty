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

/** Hover pencil placement relative to the value. Default `after` matches the offer editor (icon on the right). */
export type OfferEditIconPosition = "before" | "after";

interface OfferTextFieldProps {
  description?: string;
  disabled?: boolean;
  /** Where the hover pencil appears relative to the value text. */
  editIconPosition?: OfferEditIconPosition;
  onChange: (value: string | null) => void;
  placeholder?: string;
  title: string;
  value: string | null;
}

export function OfferTextField({
  value,
  onChange,
  disabled,
  title,
  description,
  placeholder,
  editIconPosition = "after",
}: OfferTextFieldProps) {
  const { t } = useTranslation("offers");
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }
    setInputValue(value ?? "");
  }, [open, value]);

  const handleSave = () => {
    const trimmed = inputValue.trim();
    onChange(trimmed || null);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className={
            editIconPosition === "before"
              ? "group/text -mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
              : "group/text relative -mx-1 cursor-pointer rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          }
          disabled={disabled}
          type="button"
        >
          {!disabled && editIconPosition === "before" ? (
            <Pencil
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/text:opacity-100"
            />
          ) : null}
          <span className="font-medium text-foreground">
            {value?.trim() || "-"}
          </span>
          {!disabled && editIconPosition === "after" ? (
            <Pencil className="absolute top-1/2 -right-5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/text:opacity-100" />
          ) : null}
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
            <h4 className="font-medium text-sm">{title}</h4>
            {description ? (
              <p className="text-muted-foreground text-xs">{description}</p>
            ) : null}
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
              {t("save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
