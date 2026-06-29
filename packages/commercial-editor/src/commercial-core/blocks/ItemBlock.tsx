import { useTranslation } from "@engenty/i18n/ui";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { TextAlignEnd } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_LOCALE,
  formatCurrency,
  getTaxRateOptionLabel,
  getUnitDisplayLabel as getUnitLabel,
  getUnitOptionLabel,
  type CommercialBlock as OfferBlock,
  sanitizeHtml,
  stripHtmlTags,
  type TaxRate,
  type Unit,
} from "../../types";
import { EditableContent } from "../shared/EditableContent";

interface ItemBlockProps {
  block: OfferBlock;
  currency: string;
  /** Optional display symbol (e.g. €). If set, shown instead of currency code. */
  currencySymbol?: string;
  editingBlockId: string | null;
  index: number;
  isReadOnly: boolean;
  locale?: string;
  offerStatus: string;
  onEdit: (index: number, content: any) => void;
  onSetEditingBlockId: (id: string | null) => void;
  showTaxPerItem?: boolean;
  taxRates: TaxRate[];
  units: Unit[];
}

const defaultCurrencyDisplay = (code: string, symbol?: string) =>
  symbol?.trim() || code;

export const ItemBlock = ({
  block,
  index,
  isReadOnly,
  offerStatus,
  editingBlockId,
  currency,
  currencySymbol,
  taxRates,
  units,
  showTaxPerItem = true,
  locale = DEFAULT_LOCALE,
  onEdit,
  onSetEditingBlockId,
}: ItemBlockProps) => {
  const { t } = useTranslation("offers");
  const isEditing = editingBlockId === block.id && offerStatus === "draft";
  const [showContentField, setShowContentField] = useState(false);
  const [focusContent, setFocusContent] = useState(false);

  const hasContent = !!stripHtmlTags(block.content?.content ?? "").trim();
  const hadNonEmptyContentRef = useRef(hasContent);

  // Show content field if: has content, or user triggered it (Enter or icon click)
  const shouldShowContentInput = hasContent || showContentField;

  // Reset state when switching blocks
  useEffect(
    () => () => {
      setShowContentField(false);
      setFocusContent(false);
    },
    []
  );

  useEffect(() => {
    hadNonEmptyContentRef.current = hasContent;
  }, [block.id, hasContent]);

  // Special unit types
  const unit = block.content.unit || "h";
  const isTextUnit = unit === "text";
  const isFixedUnit = unit === "fixed";

  // Price column: optional cents (1.200 | 56,50). Total same.
  const effectiveLocale = locale || DEFAULT_LOCALE;
  const currencyDisplay = defaultCurrencyDisplay(currency, currencySymbol);
  const effectiveAmount = isFixedUnit ? 1 : block.content.amount || 0;
  const itemTotal = isTextUnit
    ? 0
    : effectiveAmount * (block.content.cost_per_item || 0);
  const formattedTotal = formatCurrency(itemTotal, effectiveLocale);
  const formattedCostPerItem = formatCurrency(
    block.content.cost_per_item || 0,
    effectiveLocale
  );

  // Grid columns - always use same layout for consistent column widths
  const gridColsClass = showTaxPerItem
    ? "grid-cols-[60px_80px_1fr_60px_100px_100px]"
    : "grid-cols-[60px_80px_1fr_100px_100px]";

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setShowContentField(true);
      setFocusContent(true);
    }
  };

  const getUnitDisplayLabel = (unitValue: string, amount?: number) =>
    getUnitLabel(units, unitValue, amount);

  return (
    <div>
      {isReadOnly || isEditing ? (
        /* Display View */
        <div
          className={`cursor-pointer rounded hover:bg-muted/20 ${isReadOnly ? "border-border border-b last:border-b-0" : ""}`}
          onClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
        >
          <div className={`grid ${gridColsClass} items-start gap-3 py-1`}>
            {/* Amount - hide for text, show empty for fixed */}
            {isTextUnit ? (
              <div />
            ) : isFixedUnit ? (
              <div />
            ) : (
              <div className="pt-0.5 text-right text-foreground text-sm">
                {block.content.amount || 1}
              </div>
            )}

            {/* Unit */}
            <div className="pt-0.5 text-center text-foreground text-sm">
              {getUnitDisplayLabel(unit, effectiveAmount)}
            </div>

            {/* Title & Content */}
            <div>
              <div className="font-medium text-foreground text-sm">
                {block.content.title || "Item Title"}
              </div>
              {hasContent && (
                <div
                  className="rich-text-preview prose prose-sm dark:prose-invert mt-1 max-w-none pb-1 text-muted-foreground [&>p:last-child]:mb-0 [&>p]:mb-0"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(block.content.content),
                  }}
                />
              )}
            </div>

            {/* Tax, Price, Total - show empty cells for text units to maintain grid */}
            {isTextUnit ? (
              <>
                {showTaxPerItem && <div />}
                <div />
                <div />
              </>
            ) : (
              <>
                {showTaxPerItem && (
                  <div className="pt-0.5 text-center text-foreground text-sm">
                    {block.content.tax || 19}%
                  </div>
                )}
                <div className="pt-0.5 text-right text-foreground text-sm">
                  {currencyDisplay} {formattedCostPerItem}
                </div>
                <div className="pt-0.5 text-right font-medium text-foreground text-sm">
                  {formattedTotal}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Edit View - Desktop */
        <div
          className={`hidden lg:block ${isReadOnly ? "border-border border-b last:border-b-0" : ""}`}
        >
          <div className={`grid ${gridColsClass} items-center gap-3 py-1`}>
            {/* Amount - hide for text and fixed */}
            {isTextUnit || isFixedUnit ? (
              <div />
            ) : (
              <div>
                <Input
                  className="rounded border-none bg-input/30 px-2 text-right text-sm shadow-none focus-visible:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                  onChange={(e) =>
                    onEdit(index, {
                      ...block.content,
                      amount:
                        e.target.value === ""
                          ? ""
                          : Number.parseFloat(e.target.value),
                    })
                  }
                  placeholder={t("offers.itemQuantity")}
                  value={block.content.amount ?? ""}
                />
              </div>
            )}

            {/* Unit selector */}
            <div>
              <Select
                onValueChange={(value) =>
                  onEdit(index, { ...block.content, unit: value })
                }
                value={unit}
              >
                <SelectTrigger className="border-none bg-input/30 px-2 text-sm shadow-none focus:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 [&>svg]:opacity-0 [&>svg]:transition-opacity group-hover:[&>svg]:opacity-100">
                  <SelectValue>
                    {getUnitDisplayLabel(unit, effectiveAmount)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter(
                      (u) => u.value != null && String(u.value).trim() !== ""
                    )
                    .map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {getUnitOptionLabel(u)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="relative">
              <Input
                className={`min-w-0 flex-1 rounded border-none pr-8 pl-0 font-medium text-sm shadow-none ${isReadOnly ? "bg-transparent text-foreground" : "bg-input/30 text-foreground focus-visible:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"}`}
                onChange={(e) =>
                  onEdit(index, { ...block.content, title: e.target.value })
                }
                onKeyDown={handleTitleKeyDown}
                placeholder={t("offers.itemTitle")}
                value={block.content.title}
              />
              {!(isReadOnly || shouldShowContentInput) && (
                <button
                  aria-label={t("offers.addDescription", "Add description")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setShowContentField(true);
                    setFocusContent(true);
                  }}
                  title={t("offers.addDescription", "Add description")}
                  type="button"
                >
                  <TextAlignEnd className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Tax, Price, Total - show empty cells for text units to maintain grid */}
            {isTextUnit ? (
              <>
                {showTaxPerItem && <div />}
                <div />
                <div />
              </>
            ) : (
              <>
                {showTaxPerItem && (
                  <div>
                    <Select
                      onValueChange={(value) =>
                        onEdit(index, {
                          ...block.content,
                          tax: Number.parseFloat(value),
                        })
                      }
                      value={String(
                        block.content.tax ?? taxRates[0]?.value ?? 0
                      )}
                    >
                      <SelectTrigger className="border-none bg-input/30 px-2 text-sm shadow-none focus:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 [&>svg]:opacity-0 [&>svg]:transition-opacity group-hover:[&>svg]:opacity-100">
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
                )}
                <div className="relative">
                  <span className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground text-xs">
                    {currencyDisplay}
                  </span>
                  <Input
                    className="rounded border-none bg-input/30 pr-2 pl-12 text-sm shadow-none focus-visible:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                    onChange={(e) =>
                      onEdit(index, {
                        ...block.content,
                        cost_per_item: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder={t("offers.itemPrice")}
                    value={block.content.cost_per_item || 0}
                  />
                </div>
                <div>
                  <Input
                    className="border-none bg-transparent px-2 text-right text-muted-foreground text-sm shadow-none focus-visible:ring-0"
                    readOnly
                    value={formattedTotal}
                  />
                </div>
              </>
            )}
          </div>
          {/* Content field below title */}
          {shouldShowContentInput && (
            <div className={`grid ${gridColsClass} gap-3`}>
              <div />
              <div />
              <div className="col-span-1">
                <EditableContent
                  allowedFormats={{
                    bold: true,
                    italic: true,
                    underline: true,
                    strikethrough: true,
                    headings: false,
                    lists: true,
                    links: true,
                  }}
                  autoFocus={focusContent}
                  content={block.content.content || ""}
                  disabled={isReadOnly}
                  hideHeadings
                  onChange={(content) => {
                    onEdit(index, { ...block.content, content });
                    const nextHasContent =
                      stripHtmlTags(content || "").trim().length > 0;
                    const hadNonEmpty = hadNonEmptyContentRef.current;
                    if (!nextHasContent && hadNonEmpty) {
                      setShowContentField(false);
                    }
                    hadNonEmptyContentRef.current = nextHasContent;
                  }}
                  placeholder={t("offers.itemContent", "Description...")}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile Layout - always editable in draft mode */}
      <div className="space-y-2 lg:hidden">
        <div className="relative">
          <Input
            className="min-w-0 flex-1 pr-8 font-medium text-sm"
            disabled={isReadOnly}
            onChange={(e) =>
              onEdit(index, { ...block.content, title: e.target.value })
            }
            onKeyDown={handleTitleKeyDown}
            placeholder="Item Title"
            value={block.content.title}
          />
          {!(isReadOnly || shouldShowContentInput) && (
            <button
              aria-label={t("offers.addDescription", "Add description")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setShowContentField(true);
                setFocusContent(true);
              }}
              title={t("offers.addDescription", "Add description")}
              type="button"
            >
              <TextAlignEnd className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Content field for mobile */}
        {shouldShowContentInput && (
          <EditableContent
            content={block.content.content || ""}
            disabled={isReadOnly}
            hideHeadings
            onChange={(content) => {
              onEdit(index, { ...block.content, content });
              const nextHasContent =
                stripHtmlTags(content || "").trim().length > 0;
              const hadNonEmpty = hadNonEmptyContentRef.current;
              if (!nextHasContent && hadNonEmpty) {
                setShowContentField(false);
              }
              hadNonEmptyContentRef.current = nextHasContent;
            }}
            placeholder={t("offers.itemContent", "Description...")}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          {/* Amount - hide for text and fixed */}
          {!(isTextUnit || isFixedUnit) && (
            <div>
              <Label className="mb-1 block text-xs">Amount</Label>
              <Input
                className="text-sm"
                disabled={isReadOnly}
                onChange={(e) =>
                  onEdit(index, {
                    ...block.content,
                    amount:
                      e.target.value === ""
                        ? ""
                        : Number.parseFloat(e.target.value),
                  })
                }
                placeholder={t("offers.itemQuantity")}
                value={block.content.amount ?? ""}
              />
            </div>
          )}
          <div>
            <Label className="mb-1 block text-xs">Unit</Label>
            <Select
              disabled={isReadOnly}
              onValueChange={(value) =>
                onEdit(index, { ...block.content, unit: value })
              }
              value={unit}
            >
              <SelectTrigger className="text-sm">
                <SelectValue>
                  {getUnitDisplayLabel(unit, effectiveAmount)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {units
                  .filter(
                    (u) => u.value != null && String(u.value).trim() !== ""
                  )
                  .map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {getUnitOptionLabel(u)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {/* Tax and Cost - hide for text */}
          {!isTextUnit && (
            <>
              {showTaxPerItem && (
                <div>
                  <Label className="mb-1 block text-xs">Tax</Label>
                  <Select
                    disabled={isReadOnly}
                    onValueChange={(value) =>
                      onEdit(index, {
                        ...block.content,
                        tax: Number.parseFloat(value),
                      })
                    }
                    value={String(block.content.tax ?? taxRates[0]?.value ?? 0)}
                  >
                    <SelectTrigger className="text-sm">
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
              )}
              <div>
                <Label className="mb-1 block text-xs">
                  Cost ({currencyDisplay})
                </Label>
                <Input
                  className="text-sm"
                  disabled={isReadOnly}
                  onChange={(e) =>
                    onEdit(index, {
                      ...block.content,
                      cost_per_item: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder={t("offers.itemPrice")}
                  value={block.content.cost_per_item || 0}
                />
              </div>
            </>
          )}
        </div>
        {/* Total - hide for text */}
        {!isTextUnit && (
          <div className="pt-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Total:</span>
              <span className="font-medium text-sm">
                {currencyDisplay} {formattedTotal}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
