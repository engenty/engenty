import { useTranslation } from "@engenty/i18n/ui";
import {
  Input,
  Label,
  NumberStepper,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { CommercialBlock as OfferBlock, TaxRate, Unit } from "../../types";
import {
  DEFAULT_LOCALE,
  formatCurrencyPrice,
  getTaxRateOptionLabel,
  getUnitDisplayLabel,
  getUnitOptionLabel,
} from "../../types";
import { RichTextEditor } from "../RichTextEditor";
import { EditDialog } from "../shared/EditDialog";

interface LineItemEditDialogProps {
  block: OfferBlock | null;
  currency?: string;
  locale?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (content: Record<string, unknown>) => void;
  open: boolean;
  /** When true, show position field and set position_manual on save (invoice). */
  showPositionField?: boolean;
  showTaxPerItem?: boolean;
  taxRates: TaxRate[];
  units: Unit[];
}

export const LineItemEditDialog = ({
  block,
  open,
  onOpenChange,
  onSave,
  units,
  taxRates,
  showTaxPerItem = false,
  showPositionField = false,
  currency = "EUR",
  locale = DEFAULT_LOCALE,
}: LineItemEditDialogProps) => {
  const { t } = useTranslation("offers");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [position, setPosition] = useState("");
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("h");
  const [costPerItem, setCostPerItem] = useState(0);
  const [tax, setTax] = useState(20);

  const isTimeUnit = unit === "h" || unit === "d";
  const quantityStep = isTimeUnit ? 0.25 : 1;
  const quantityStepLarge = isTimeUnit ? 1 : 10;
  const isTextUnit = unit === "text";
  const isFixedUnit = unit === "fixed";
  const total = isTextUnit ? 0 : amount * costPerItem;
  const taxAmount = showTaxPerItem && !isTextUnit ? total * (tax / 100) : 0;
  const formattedSum = formatCurrencyPrice(total, locale, currency);
  const formattedTax = formatCurrencyPrice(taxAmount, locale, currency);

  useEffect(() => {
    if (block?.content && open) {
      setTitle(String(block.content.title ?? ""));
      setContent(String(block.content.content ?? ""));
      setPosition(
        block.content.position == null ? "" : String(block.content.position)
      );
      setAmount(
        typeof block.content.amount === "number" ? block.content.amount : 1
      );
      setUnit(String(block.content.unit ?? "h"));
      setCostPerItem(Number(block.content.cost_per_item) || 0);
      setTax(Number(block.content.tax) ?? taxRates[0]?.value ?? 20);
    }
  }, [block, open, taxRates]);

  const handleSave = () => {
    if (!block) {
      return;
    }
    const saved: Record<string, unknown> = {
      ...block.content,
      title: title.trim(),
      content,
      amount,
      unit,
      cost_per_item: costPerItem,
      tax,
    };
    if (showPositionField) {
      saved.position = position.trim() || undefined;
      saved.position_manual = true;
    }
    onSave(saved);
    onOpenChange(false);
  };

  if (!block) {
    return null;
  }

  return (
    <EditDialog
      contentClassName="gap-4"
      onOpenChange={onOpenChange}
      onSave={handleSave}
      open={open}
      title={t("common.edit")}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="line-item-position">
          {t("offers.position", "Position")}
        </Label>
        <Input
          className={`h-9 ${showPositionField ? "" : "bg-muted/30 text-muted-foreground"}`}
          id="line-item-position"
          onChange={(e) => setPosition(e.target.value)}
          placeholder="1, 1.1, 2..."
          readOnly={!showPositionField}
          value={position}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="line-item-title">{t("offers.description")}</Label>
        <Input
          className="h-9"
          id="line-item-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("offers.itemTitle")}
          value={title}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="line-item-content">
          {t("offers.itemContent", "Description...")}
        </Label>
        <div className="min-h-[100px] w-full overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <RichTextEditor
            containerClassName="min-h-[100px] rounded-none border-0 focus-within:ring-0"
            content={content}
            hideHeadings
            onChange={setContent}
            placeholder={t("offers.itemContent", "Description...")}
            toolbarVariant="top"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="line-item-amount">{t("offers.quantity")}</Label>
          {isTextUnit || isFixedUnit ? (
            <Input
              className="h-9 bg-muted/30 text-muted-foreground"
              readOnly
              value=""
            />
          ) : (
            <NumberStepper
              aria-label={t("offers.quantity")}
              className="h-9 px-3"
              inputClassName="h-9 border-0 bg-transparent shadow-none"
              max={10_000}
              min={-10_000}
              onChange={setAmount}
              showButtons={false}
              step={quantityStep}
              stepLarge={quantityStepLarge}
              value={amount}
            />
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="line-item-unit">{t("offers.unit", "Unit")}</Label>
          <Select onValueChange={setUnit} value={unit}>
            <SelectTrigger className="h-9" id="line-item-unit">
              <SelectValue>
                {getUnitDisplayLabel(units, unit, amount)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {units
                .filter((u) => u.value != null && String(u.value).trim() !== "")
                .map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {getUnitOptionLabel(u)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="line-item-price">{t("offers.unitPrice")}</Label>
          {isTextUnit ? (
            <Input
              className="h-9 bg-muted/30 text-muted-foreground"
              readOnly
              value=""
            />
          ) : (
            <NumberStepper
              aria-label={t("offers.unitPrice")}
              className="h-9 px-3"
              inputClassName="h-9 border-0 bg-transparent shadow-none"
              max={10_000_000}
              min={-10_000_000}
              onChange={setCostPerItem}
              showButtons={false}
              step={1}
              stepLarge={10}
              value={costPerItem}
            />
          )}
        </div>
      </div>
      {showTaxPerItem && !isTextUnit && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="line-item-tax">{t("offers.tax", "Tax")}</Label>
            <Select
              onValueChange={(v) => setTax(Number.parseFloat(v))}
              value={String(tax)}
            >
              <SelectTrigger className="h-9" id="line-item-tax">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {taxRates.some((r) => r.value === 0) ? null : (
                  <SelectItem value="0">0%</SelectItem>
                )}
                {taxRates.map((rate, idx) => (
                  <SelectItem
                    key={`${rate.name}-${rate.value}-${idx}`}
                    value={String(rate.value)}
                  >
                    {getTaxRateOptionLabel(rate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-sm">=</span>
            <span className="font-medium text-base tabular-nums">
              {formattedTax}
            </span>
          </div>
        </div>
      )}
      <div className="mt-1 flex items-center justify-end gap-4 border-t pt-4">
        <span className="text-muted-foreground text-sm">
          {t("offers.total")}
        </span>
        <span className="font-semibold text-base tabular-nums">
          {formattedSum}
        </span>
      </div>
    </EditDialog>
  );
};
