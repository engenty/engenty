import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkOfferNumberAvailability,
  getNextOfferNumber,
  getOfferSettings,
  type OfferSettings,
} from "../api.js";
import type { OfferEditIconPosition } from "./offer-text-field.js";

interface OfferNumberFieldProps {
  disabled?: boolean;
  /** Where the hover pencil appears relative to the value text. */
  editIconPosition?: OfferEditIconPosition;
  offerId: string;
  onSave: (nextValue: string) => Promise<void> | void;
  value: string;
}

function getFormatParts(settings?: OfferSettings | null) {
  const year = new Date().getFullYear().toString();
  return {
    prefix: (settings?.offer_id_prefix ?? "").replace("{year}", year),
    postfix: settings?.offer_id_postfix ?? "",
  };
}

function parseNumberPart(
  idValue: string,
  settings?: OfferSettings | null
): string | null {
  const { prefix, postfix } = getFormatParts(settings);
  let numberPart = idValue.trim();

  if (prefix) {
    if (!numberPart.startsWith(prefix)) {
      return null;
    }
    numberPart = numberPart.slice(prefix.length);
  }
  if (postfix) {
    if (!numberPart.endsWith(postfix)) {
      return null;
    }
    numberPart = numberPart.slice(0, -postfix.length);
  }
  return numberPart;
}

function isValidFormat(idValue: string, settings?: OfferSettings | null) {
  const numberPart = parseNumberPart(idValue, settings);
  if (!numberPart) {
    return false;
  }
  const parsed = Number.parseInt(numberPart, 10);
  return (
    Number.isFinite(parsed) && parsed > 0 && parsed.toString() === numberPart
  );
}

export function OfferNumberField({
  offerId,
  value,
  onSave,
  disabled = false,
  editIconPosition = "after",
}: OfferNumberFieldProps) {
  const { t } = useTranslation("offers");
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<OfferSettings | null>(null);
  const [useCustomId, setUseCustomId] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isInvalidFormat, setIsInvalidFormat] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatParts = useMemo(() => getFormatParts(settings), [settings]);

  useEffect(() => {
    if (!open) {
      return;
    }
    getOfferSettings()
      .then((next) => setSettings(next))
      .catch(() => setSettings(null));
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setUseCustomId(false);
    setInputValue(value);
    setChecking(false);
    setIsDuplicate(false);
    setIsInvalidFormat(false);
    setHasChecked(true);
  }, [open, value]);

  const checkDuplicate = useCallback(
    async (candidate: string) => {
      const trimmed = candidate.trim();
      if (!trimmed) {
        setIsDuplicate(false);
        setHasChecked(false);
        return;
      }
      setChecking(true);
      try {
        const result = await checkOfferNumberAvailability(trimmed, offerId);
        setIsDuplicate(!result.available);
      } catch {
        setIsDuplicate(false);
      } finally {
        setChecking(false);
        setHasChecked(true);
      }
    },
    [offerId]
  );

  const validateAndCheck = useCallback(
    (candidate: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      setHasChecked(false);
      setIsDuplicate(false);
      setIsInvalidFormat(false);

      debounceRef.current = setTimeout(() => {
        if (!useCustomId) {
          const valid = isValidFormat(candidate, settings);
          setIsInvalidFormat(!valid);
          if (!valid) {
            return;
          }
        } else if (!candidate.trim()) {
          return;
        }
        checkDuplicate(candidate);
      }, 400);
    },
    [checkDuplicate, settings, useCustomId]
  );

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const { offer_number } = await getNextOfferNumber();
      setInputValue(offer_number);
      setUseCustomId(false);
      setIsDuplicate(false);
      setIsInvalidFormat(false);
      setHasChecked(true);
    } catch {
      setHasChecked(false);
    } finally {
      setRegenerating(false);
    }
  }, []);

  const canSave = useMemo(() => {
    const trimmed = inputValue.trim();
    const changed = trimmed !== value;
    if (!changed || disabled || saving || checking || regenerating) {
      return false;
    }
    if (useCustomId) {
      return trimmed.length > 0 && hasChecked && !isDuplicate;
    }
    return trimmed.length > 0 && hasChecked && !isDuplicate && !isInvalidFormat;
  }, [
    checking,
    disabled,
    hasChecked,
    inputValue,
    isDuplicate,
    isInvalidFormat,
    regenerating,
    saving,
    useCustomId,
    value,
  ]);

  const handleSave = useCallback(async () => {
    if (!canSave) {
      return;
    }
    const trimmed = inputValue.trim();
    setSaving(true);
    try {
      await onSave(trimmed);
      setOpen(false);
    } catch {
      // Keep dialog open and let user try again.
    } finally {
      setSaving(false);
    }
  }, [canSave, inputValue, onSave]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className={
            editIconPosition === "before"
              ? "group/number -mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
              : "group/number relative -mx-1 cursor-pointer rounded px-1 text-left hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          }
          disabled={disabled}
          type="button"
        >
          {!disabled && editIconPosition === "before" ? (
            <Pencil
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/number:opacity-100"
            />
          ) : null}
          <span className="font-medium text-foreground">{value}</span>
          {!disabled && editIconPosition === "after" ? (
            <Pencil className="absolute top-1/2 -right-5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/number:opacity-100" />
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
            <h4 className="font-medium text-sm">{t("editOfferNumber")}</h4>
            <p className="text-muted-foreground text-xs">
              {t("editOfferNumberDescription")}
            </p>
          </div>

          {!useCustomId && (formatParts.prefix || formatParts.postfix) ? (
            <p className="text-muted-foreground text-xs">
              {t("offerNumberFormatHint", {
                prefix: formatParts.prefix || "-",
                postfix: formatParts.postfix || "-",
              })}
            </p>
          ) : null}

          <Input
            className={`text-sm ${isDuplicate || isInvalidFormat ? "border-destructive" : ""}`}
            disabled={disabled || saving}
            onBlur={() => validateAndCheck(inputValue)}
            onChange={(event) => {
              const next = event.target.value;
              setInputValue(next);
              validateAndCheck(next);
            }}
            value={inputValue}
          />

          {checking ? (
            <p className="text-muted-foreground text-xs">
              {t("offerNumberChecking")}
            </p>
          ) : null}
          {!checking && isInvalidFormat ? (
            <p className="text-destructive text-xs">
              {t("offerNumberInvalidFormat")}
            </p>
          ) : null}
          {!checking && hasChecked && isDuplicate ? (
            <p className="text-destructive text-xs">
              {t("offerNumberDuplicate")}
            </p>
          ) : null}
          {!checking &&
          hasChecked &&
          !isDuplicate &&
          !isInvalidFormat &&
          inputValue.trim() !== value ? (
            <p className="text-green-600 text-xs">
              {t("offerNumberAvailable")}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Checkbox
              checked={useCustomId}
              disabled={disabled || saving}
              id={`offer-custom-id-${offerId}`}
              onCheckedChange={(checked) => {
                const enabled = Boolean(checked);
                setUseCustomId(enabled);
                setIsDuplicate(false);
                setIsInvalidFormat(false);
                setHasChecked(false);
                if (!enabled) {
                  setInputValue(value);
                }
              }}
            />
            <Label
              className="cursor-pointer text-xs"
              htmlFor={`offer-custom-id-${offerId}`}
            >
              {t("offerNumberUseCustomId")}
            </Label>
          </div>

          <div className="flex items-center justify-end gap-1 pt-1">
            <Button
              disabled={disabled || saving || regenerating}
              onClick={() => {
                handleRegenerate();
              }}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={`mr-1 h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`}
              />
              {t("offerNumberRegenerate")}
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => {
                handleSave();
              }}
              size="sm"
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              {t("save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
