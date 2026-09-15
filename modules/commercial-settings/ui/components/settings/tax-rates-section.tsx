import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Label } from "@engenty/ui-core";
import { Lock, Plus, Trash2 } from "lucide-react";
import type { TaxRate } from "../../api.js";
import {
  BUILT_IN_NO_TAX,
  getRegionFromLocale,
} from "../../lib/locale-config.js";
import { STANDARD_TAX_PRESETS } from "../../lib/region-packs.js";
import { mergeStandardTaxRatesForRegion } from "../../lib/standard-tax-presets.js";

interface TaxRatesSectionProps {
  defaultLocale: string;
  noTaxReason: string;
  onNoTaxReasonChange: (v: string) => void;
  onTaxRatesChange: (rates: TaxRate[]) => void;
  taxRates: TaxRate[];
}

export function TaxRatesSection({
  defaultLocale,
  taxRates,
  noTaxReason,
  onTaxRatesChange,
  onNoTaxReasonChange,
}: TaxRatesSectionProps) {
  const { t } = useTranslation("commercial-settings");
  const region = getRegionFromLocale(defaultLocale || "de-DE");
  const presetCount = STANDARD_TAX_PRESETS[region]?.length ?? 0;
  const presetAddCount = (STANDARD_TAX_PRESETS[region] ?? []).filter(
    (p) => !taxRates.some((r) => r.value === p.value)
  ).length;

  const addTaxRate = () => {
    onTaxRatesChange([
      ...taxRates,
      { name: "", label: "", value: 0, is_default: false },
    ]);
  };

  const mergePresets = () => {
    onTaxRatesChange(mergeStandardTaxRatesForRegion(taxRates, region));
  };

  const removeTaxRate = (index: number) => {
    onTaxRatesChange(taxRates.filter((_, i) => i !== index));
  };

  const updateTaxRate = (
    index: number,
    field: keyof TaxRate,
    value: string | number | boolean
  ) => {
    const updated = [...taxRates];
    updated[index] = { ...updated[index], [field]: value };
    onTaxRatesChange(updated);
  };

  const setStandardIndex = (index: number) => {
    onTaxRatesChange(
      taxRates.map((r, i) => ({
        ...r,
        is_default: i === index,
      }))
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.taxRates")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.taxRatesDesc")}
        </p>
      </div>
      <div className="ui-card-panel overflow-hidden">
        <div className="p-4">
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2 px-1 text-muted-foreground text-xs">
              <span className="w-24 shrink-0">{t("sections.taxAbbrev")}</span>
              <span className="min-w-0 flex-1">{t("sections.taxLabel")}</span>
              <span className="w-20 shrink-0 text-right">
                {t("sections.taxPercent")}
              </span>
              <span className="w-24 shrink-0 text-center">
                {t("sections.standardRate")}
              </span>
              <div className="w-7 shrink-0" />
            </div>

            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-24 shrink-0 bg-muted font-mono text-sm"
                disabled
                value={BUILT_IN_NO_TAX.name}
              />
              <Input
                className="h-8 min-w-0 flex-1 bg-muted text-sm"
                disabled
                value={t("sections.builtInNoTaxLabel")}
              />
              <Input
                className="h-8 w-20 shrink-0 bg-muted text-right text-sm"
                disabled
                value={BUILT_IN_NO_TAX.value}
              />
              <div className="flex w-24 shrink-0 justify-center text-muted-foreground text-xs">
                —
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>

            <div className="flex items-center gap-2 pl-1">
              <Label className="w-24 shrink-0 text-muted-foreground text-xs">
                {t("sections.noTaxReason")}:
              </Label>
              <Input
                className="h-8 min-w-0 flex-1 text-sm"
                onChange={(e) => onNoTaxReasonChange(e.target.value)}
                placeholder={t("sections.noTaxReasonPlaceholder")}
                value={noTaxReason}
              />
            </div>

            {taxRates.map((rate, index) => (
              <div className="flex items-center gap-2" key={index}>
                <Input
                  className="h-8 w-24 shrink-0 font-mono text-sm"
                  onChange={(e) => updateTaxRate(index, "name", e.target.value)}
                  value={rate.name}
                />
                <Input
                  className="h-8 min-w-0 flex-1 text-sm"
                  onChange={(e) =>
                    updateTaxRate(index, "label", e.target.value)
                  }
                  value={rate.label}
                />
                <Input
                  className="h-8 w-20 shrink-0 text-right text-sm"
                  onChange={(e) =>
                    updateTaxRate(
                      index,
                      "value",
                      Number.parseFloat(e.target.value)
                    )
                  }
                  type="number"
                  value={rate.value}
                />
                <div className="flex w-24 shrink-0 justify-center">
                  <input
                    aria-label={t("sections.standardRate")}
                    checked={rate.is_default === true}
                    className="h-4 w-4 accent-primary"
                    name="commercial-standard-tax"
                    onChange={() => setStandardIndex(index)}
                    type="radio"
                  />
                </div>
                <Button
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeTaxRate(index)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                className="h-7 text-xs"
                onClick={addTaxRate}
                size="sm"
                variant="outline"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("sections.addTaxRate")}
              </Button>
              <Button
                className="h-7 text-xs"
                disabled={presetCount === 0}
                onClick={mergePresets}
                size="sm"
                title={
                  presetCount === 0
                    ? t("sections.addStandardTaxRatesNone")
                    : undefined
                }
                variant="outline"
              >
                {t("sections.addStandardTaxRates", { region })}
                {presetAddCount > 0 ? ` (+${presetAddCount})` : ""}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
