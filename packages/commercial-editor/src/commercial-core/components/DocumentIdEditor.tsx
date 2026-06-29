import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from "@engenty/ui-core";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

export type DocumentType = "offer" | "invoice";

interface DocumentIdSettings {
  offset?: number | null;
  postfix?: string | null;
  prefix?: string | null;
}

interface DocumentIdEditorProps {
  defaultDisplayId: string;
  disabled?: boolean;
  displayId: string | null;
  documentId: string;
  documentType: DocumentType;
  onSave: (newId: string | null) => Promise<void>;
  /** Optional custom trigger render function. If not provided, uses default pencil button + text */
  renderTrigger?: (props: {
    onClick: () => void;
    currentDisplayId: string;
  }) => React.ReactNode;
  settings?: DocumentIdSettings | null;
}

function getFormatParts(settings?: DocumentIdSettings | null) {
  const prefix = (settings?.prefix || "").replace(
    "{year}",
    new Date().getFullYear().toString()
  );
  const postfix = settings?.postfix || "";
  return { prefix, postfix };
}

function parseIdNumber(
  id: string,
  settings?: DocumentIdSettings | null
): number | null {
  const { prefix, postfix } = getFormatParts(settings);

  let numStr = id;
  if (prefix && id.startsWith(prefix)) {
    numStr = numStr.slice(prefix.length);
  }
  if (postfix && numStr.endsWith(postfix)) {
    numStr = numStr.slice(0, -postfix.length);
  }

  const num = Number.parseInt(numStr, 10);
  return Number.isNaN(num) ? null : num;
}

function formatIdFromNumber(
  num: number,
  settings?: DocumentIdSettings | null
): string {
  const { prefix, postfix } = getFormatParts(settings);
  return `${prefix}${num}${postfix}`;
}

function isValidFormat(
  id: string,
  settings?: DocumentIdSettings | null
): boolean {
  const { prefix, postfix } = getFormatParts(settings);

  if (prefix && !id.startsWith(prefix)) {
    return false;
  }
  if (postfix && !id.endsWith(postfix)) {
    return false;
  }

  let numPart = id;
  if (prefix) {
    numPart = numPart.slice(prefix.length);
  }
  if (postfix) {
    numPart = numPart.slice(0, -postfix.length);
  }

  const num = Number.parseInt(numPart, 10);
  return !Number.isNaN(num) && num > 0 && num.toString() === numPart;
}

function getTableConfig(documentType: DocumentType) {
  if (documentType === "offer") {
    return { table: "offers", column: "offer_number" };
  }
  return { table: "invoices", column: "invoice_number" };
}

export const DocumentIdEditor = ({
  documentType,
  documentId,
  displayId,
  defaultDisplayId,
  settings,
  onSave,
  renderTrigger,
  disabled = false,
}: DocumentIdEditorProps) => {
  const { t } = useTranslation("offers");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [ignoreRules, setIgnoreRules] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isInvalidFormat, setIsInvalidFormat] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const { prefix, postfix } = getFormatParts(settings);
  const { table } = getTableConfig(documentType);

  const tKey = (key: string) => `${documentType}s.settings.${key}`;

  useEffect(() => {
    if (open) {
      const hasCustomId = displayId && displayId !== defaultDisplayId;
      setIgnoreRules(!!hasCustomId);
      setInputValue(displayId || defaultDisplayId);
      setIsDuplicate(false);
      setIsInvalidFormat(false);
      setHasChecked(false);
    }
  }, [open, displayId, defaultDisplayId]);

  const checkDuplicate = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setIsDuplicate(false);
        setHasChecked(true);
        return;
      }

      setChecking(true);
      try {
        const query =
          table === "offers"
            ? supabase
                .from("offers")
                .select("id")
                .eq("offer_number", value.trim())
                .neq("id", documentId)
                .maybeSingle()
            : supabase
                .from("invoices")
                .select("id")
                .eq("invoice_number", value.trim())
                .neq("id", documentId)
                .maybeSingle();

        const { data, error } = await query;

        if (error) {
          throw error;
        }
        setIsDuplicate(!!data);
        setHasChecked(true);
      } catch (error) {
        console.error("Error checking duplicate:", error);
        setIsDuplicate(false);
        setHasChecked(true);
      } finally {
        setChecking(false);
      }
    },
    [documentId, table]
  );

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const query =
        table === "offers"
          ? supabase
              .from("offers")
              .select("offer_number")
              .not("offer_number", "is", null)
          : supabase
              .from("invoices")
              .select("invoice_number")
              .not("invoice_number", "is", null);

      const { data: existingDocs, error } = await query;

      if (error) {
        throw error;
      }

      let highestNum = settings?.offset || 0;

      for (const doc of existingDocs || []) {
        const docNumber =
          table === "offers"
            ? (doc as { offer_number: string | null }).offer_number
            : (doc as { invoice_number: string | null }).invoice_number;
        if (docNumber) {
          const num = parseIdNumber(docNumber, settings);
          if (num !== null && num > highestNum) {
            highestNum = num;
          }
        }
      }

      const nextNum = highestNum + 1;
      const candidateId = formatIdFromNumber(nextNum, settings);

      setInputValue(candidateId);
      setIgnoreRules(false);
      setIsInvalidFormat(false);
      setIsDuplicate(false);
      setHasChecked(true);
    } catch (error) {
      console.error("Error regenerating ID:", error);
      toast.error(t("common.error"));
    } finally {
      setRegenerating(false);
    }
  }, [settings, t, table]);

  const validateAndCheck = useCallback(
    (value: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      setHasChecked(false);
      setIsDuplicate(false);
      setIsInvalidFormat(false);

      debounceRef.current = setTimeout(() => {
        if (ignoreRules) {
          if (value.trim()) {
            checkDuplicate(value);
          } else {
            setHasChecked(true);
          }
        } else {
          const stripNumberPart = (id: string): string | null => {
            let numPart = id;
            if (prefix) {
              if (!numPart.startsWith(prefix)) {
                return null;
              }
              numPart = numPart.slice(prefix.length);
            }
            if (postfix) {
              if (!numPart.endsWith(postfix)) {
                return null;
              }
              numPart = numPart.slice(0, -postfix.length);
            }
            return numPart;
          };

          const defaultNumPart = stripNumberPart(defaultDisplayId);
          const currentNumPart = stripNumberPart(value);
          if (
            defaultNumPart &&
            currentNumPart &&
            currentNumPart.length < defaultNumPart.length
          ) {
            return;
          }

          const valid = isValidFormat(value, settings);
          setIsInvalidFormat(!valid);

          if (valid && value !== defaultDisplayId) {
            checkDuplicate(value);
          } else if (valid) {
            setHasChecked(true);
          }
        }
      }, 800);
    },
    [ignoreRules, settings, defaultDisplayId, checkDuplicate, prefix, postfix]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    validateAndCheck(e.target.value);
  };

  const handleBlur = () => {
    if (!ignoreRules && inputValue) {
      const valid = isValidFormat(inputValue, settings);
      setIsInvalidFormat(!valid);
      if (valid && inputValue !== defaultDisplayId && !hasChecked) {
        checkDuplicate(inputValue);
      }
    } else if (ignoreRules && inputValue.trim() && !hasChecked) {
      checkDuplicate(inputValue);
    }
  };

  const handleSave = async () => {
    if (isDuplicate || isInvalidFormat) {
      return;
    }

    setSaving(true);
    try {
      const newId = inputValue === defaultDisplayId ? null : inputValue.trim();
      await onSave(newId);
      setOpen(false);
      toast.success(t(tKey("idSaved")));
    } catch (error) {
      console.error("Error saving ID:", error);
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleIgnoreRulesChange = (checked: boolean) => {
    setIgnoreRules(checked);
    setIsInvalidFormat(false);
    setIsDuplicate(false);
    setHasChecked(false);
    if (!checked) {
      setInputValue(defaultDisplayId);
    }
  };

  const currentDisplayId = displayId || defaultDisplayId;
  const hasChanges = inputValue !== (displayId || defaultDisplayId);
  const trimmedInput = inputValue.trim();
  const canSave =
    hasChanges &&
    hasChecked &&
    !isDuplicate &&
    !isInvalidFormat &&
    !checking &&
    (!ignoreRules || trimmedInput.length > 0);

  // biome-ignore lint/correctness/noNestedComponentDefinitions: EditorContent kept inline to avoid prop drilling
  function EditorContent() {
    return (
      <div className="space-y-3">
        <div className="space-y-1 pr-6">
          <h4 className="font-medium text-sm">{t(tKey("editId"))}</h4>
          <p className="text-muted-foreground text-xs">
            {t(tKey("editIdDescription"))}
          </p>
        </div>

        <div className="space-y-1.5">
          {!ignoreRules && (prefix || postfix) && (
            <p className="text-muted-foreground text-xs">
              {t(tKey("formatHint"), {
                prefix: prefix || "—",
                postfix: postfix || "—",
              })}
            </p>
          )}
          <Input
            className={`text-sm ${isDuplicate || isInvalidFormat ? "border-destructive" : ""}`}
            disabled={saving || disabled}
            onBlur={handleBlur}
            onChange={handleInputChange}
            placeholder={
              ignoreRules ? t(tKey("customIdPlaceholder")) : defaultDisplayId
            }
            value={inputValue}
          />
          {checking && (
            <p className="text-muted-foreground text-xs">
              {t(tKey("checkingDuplicate"))}
            </p>
          )}
          {!checking && isInvalidFormat && (
            <p className="text-destructive text-xs">
              {t(tKey("invalidFormat"))}
            </p>
          )}
          {!checking && hasChecked && isDuplicate && (
            <p className="text-destructive text-xs">{t(tKey("duplicateId"))}</p>
          )}
          {!checking &&
            hasChecked &&
            !isDuplicate &&
            !isInvalidFormat &&
            inputValue.trim() &&
            inputValue !== defaultDisplayId && (
              <p className="text-green-600 text-xs">{t(tKey("idAvailable"))}</p>
            )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={ignoreRules}
            disabled={saving || disabled}
            id="ignore-rules"
            onCheckedChange={(checked) => handleIgnoreRulesChange(!!checked)}
          />
          <Label className="cursor-pointer text-xs" htmlFor="ignore-rules">
            {t(tKey("ignoreFormattingRules"))}
          </Label>
        </div>

        <div className="flex items-center justify-end gap-1 pt-1">
          <Button
            className="h-7 px-2"
            disabled={saving || regenerating || disabled}
            onClick={handleRegenerate}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              className={`mr-1 h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`}
            />
            {t(tKey("regenerate"))}
          </Button>
          <Button
            className="h-7 px-2"
            disabled={saving || !canSave || disabled}
            onClick={handleSave}
            size="sm"
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            {t("common.save")}
          </Button>
        </div>
      </div>
    );
  }

  const defaultTrigger = (
    <div className="group flex items-center gap-1.5">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
            disabled={disabled}
            size="icon"
            variant="ghost"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align={isMobile ? "center" : "end"}
          className="w-80 p-3"
          sideOffset={4}
        >
          <Button
            className="absolute top-1 right-1 h-6 w-6"
            disabled={saving}
            onClick={() => setOpen(false)}
            size="icon"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <EditorContent />
        </PopoverContent>
      </Popover>
      <span className="text-sm">{currentDisplayId}</span>
    </div>
  );

  const customTrigger = renderTrigger ? (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <div>{renderTrigger({ onClick: () => {}, currentDisplayId })}</div>
      </PopoverTrigger>
      <PopoverContent
        align={isMobile ? "center" : "start"}
        className="w-80 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Button
          className="absolute top-1 right-1 h-6 w-6"
          disabled={saving}
          onClick={() => setOpen(false)}
          size="icon"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <EditorContent />
      </PopoverContent>
    </Popover>
  ) : null;

  return renderTrigger ? customTrigger : defaultTrigger;
};
