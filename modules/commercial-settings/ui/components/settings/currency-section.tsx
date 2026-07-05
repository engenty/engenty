import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { ChevronDown, ChevronsUpDown } from "lucide-react";
import { useCallback, useState } from "react";
import type { LocaleOption } from "../../lib/locale-config.js";
import {
  getCurrencyFromLocale,
  getLocaleLabel,
  LOCALE_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
} from "../../lib/locale-config.js";

interface CurrencySectionProps {
  currency: string;
  currencySymbol: string;
  defaultLocale: string;
  numberLocale: string;
  onCurrencyChange: (v: string) => void;
  onCurrencySymbolChange: (v: string) => void;
  onDefaultLocaleChange: (v: string) => void;
  onNumberLocaleChange: (v: string) => void;
}

export function CurrencySection({
  currency,
  currencySymbol,
  numberLocale,
  defaultLocale,
  onCurrencyChange,
  onCurrencySymbolChange,
  onNumberLocaleChange,
  onDefaultLocaleChange,
}: CurrencySectionProps) {
  const { t, i18n } = useTranslation("commercial-settings");
  const [localeOpen, setLocaleOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleLocaleSelect = useCallback(
    (opt: LocaleOption) => {
      onDefaultLocaleChange(opt.value);
      const { code, symbol } = getCurrencyFromLocale(opt.value);
      onCurrencyChange(code);
      onCurrencySymbolChange(symbol);
      const numFmt = opt.value.startsWith("de")
        ? "de-DE"
        : opt.value.startsWith("en")
          ? "en-US"
          : opt.value;
      onNumberLocaleChange(numFmt);
      setLocaleOpen(false);
    },
    [
      onDefaultLocaleChange,
      onCurrencyChange,
      onCurrencySymbolChange,
      onNumberLocaleChange,
    ]
  );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.currency")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.currencyDesc")}
        </p>
      </div>
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 flex-1">
            <Label className="font-semibold text-base" htmlFor="default-locale">
              {t("sections.standardLocale")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("sections.standardLocaleDesc")}
            </p>
          </div>
          <Popover onOpenChange={setLocaleOpen} open={localeOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-expanded={localeOpen}
                className={cn(
                  "max-w-[280px] shrink-0 justify-between font-normal",
                  !defaultLocale && "text-muted-foreground"
                )}
                id="default-locale"
                role="combobox"
                variant="outline"
              >
                {defaultLocale
                  ? `${getLocaleLabel(
                      LOCALE_OPTIONS.find((o) => o.value === defaultLocale) ??
                        LOCALE_OPTIONS[0],
                      i18n.language ?? "de"
                    )} (${defaultLocale}, ${currency || "EUR"})`
                  : t("sections.standardLocale")}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--anchor-width) p-0">
              <Command>
                <CommandInput placeholder={t("sections.standardLocale")} />
                <CommandList>
                  <CommandEmpty>Keine Ergebnisse</CommandEmpty>
                  <CommandGroup>
                    {LOCALE_OPTIONS.map((opt) => (
                      <CommandItem
                        key={opt.value}
                        onSelect={() => handleLocaleSelect(opt)}
                        value={`${opt.labelDe} ${opt.labelEn} ${opt.value}`}
                      >
                        {getLocaleLabel(opt, i18n.language ?? "de")} (
                        {opt.value}, {opt.currency})
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <Collapsible onOpenChange={setDetailsOpen} open={detailsOpen}>
          <CollapsibleTrigger asChild>
            <button
              aria-expanded={detailsOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              <span className="font-semibold text-base text-muted-foreground">
                {t("sections.codeSymbolFormat")}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  detailsOpen && "rotate-180"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex items-center justify-between gap-4 border-t p-4">
              <div className="min-w-0 flex-1">
                <Label className="font-semibold text-base" htmlFor="currency">
                  {t("sections.currencyCode")}
                </Label>
                <p className="text-muted-foreground text-sm">
                  {t("sections.currencyCodeDesc")}
                </p>
              </div>
              <Input
                className="max-w-[120px] shrink-0"
                id="currency"
                onChange={(e) => onCurrencyChange(e.target.value)}
                placeholder="EUR"
                value={currency}
              />
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Label
                  className="font-semibold text-base"
                  htmlFor="currency-symbol"
                >
                  {t("sections.currencySymbol")}
                </Label>
                <p className="text-muted-foreground text-sm">
                  {t("sections.currencySymbolDesc")}
                </p>
              </div>
              <Input
                className="max-w-[100px] shrink-0"
                id="currency-symbol"
                onChange={(e) => onCurrencySymbolChange(e.target.value)}
                placeholder="€"
                value={currencySymbol}
              />
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Label
                  className="font-semibold text-base"
                  htmlFor="number-format"
                >
                  {t("sections.numberFormat")}
                </Label>
                <p className="text-muted-foreground text-sm">
                  {t("sections.numberFormatDesc")}
                </p>
              </div>
              <Select
                onValueChange={(v) => onNumberLocaleChange(v ?? "")}
                value={numberLocale || undefined}
              >
                <SelectTrigger
                  className="max-w-[280px] shrink-0"
                  id="number-format"
                >
                  <SelectValue placeholder={t("sections.numberFormat")}>
                    {numberLocale
                      ? (() => {
                          const opt = NUMBER_FORMAT_OPTIONS.find(
                            (o) => o.value === numberLocale
                          );
                          return opt
                            ? `${opt.formatLabel} (${opt.value})`
                            : numberLocale;
                        })()
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {NUMBER_FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.formatLabel} ({opt.value})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
