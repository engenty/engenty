import { useTranslation } from "@engenty/i18n/ui";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { HelpCircle } from "lucide-react";
import { useMemo } from "react";
import {
  buildDefaultTaxRateSelectOptions,
  getTaxRateOptionLabel,
  type TaxRate,
} from "../../types";
import { SettingsCardSeparator } from "../shared/settings/SettingsCard";
import { formatPhaseIndex } from "../utils/formatPhaseIndex";

export interface PhaseDisplaySettings {
  defaultTaxRate?: number;
  phaseIndexPattern: string;
  showPhaseIndex: boolean;
  showPhaseTotals: boolean;
  showTaxPerItem: boolean;
}

type PhaseDisplayContentScope = "full" | "taxOnly" | "phaseOnly";

interface PhaseDisplaySettingsCardProps {
  contentScope?: PhaseDisplayContentScope;
  disabled?: boolean;
  displaySettings: PhaseDisplaySettings;
  documentType: "offer" | "invoice";
  onDisplaySettingChange: (
    key: keyof PhaseDisplaySettings,
    value: boolean | string | number
  ) => void;
  showPhaseSettings?: boolean;
  showTaxSettings?: boolean;
  taxRates?: TaxRate[];
}

const formatPhaseIndexPreview = (pattern: string): string =>
  `${[1, 2, 3].map((i) => formatPhaseIndex(pattern, i)).join(", ")}...`;

const PHASE_INDEX_PATTERN_EXAMPLES = [
  { sample: "1, 2, 3...", token: "1" },
  { sample: "A, B, C...", token: "A" },
  { sample: "a, b, c...", token: "a" },
  { sample: "I, II, III...", token: "I" },
] as const;

function PhaseIndexPatternHelp({ helpText }: { helpText: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 cursor-help text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-sm py-2" side="top">
          <div className="flex min-w-[14rem] flex-col gap-2 text-left">
            <p className="text-xs leading-snug">{helpText}</p>
            <ul className="space-y-1 text-xs">
              {PHASE_INDEX_PATTERN_EXAMPLES.map(({ sample, token }) => (
                <li className="flex items-center gap-1.5" key={token}>
                  <code className="rounded bg-background/20 px-1 font-mono">
                    {token}
                  </code>
                  <span aria-hidden>→</span>
                  <span>{sample}</span>
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const PhaseDisplaySettingsCard = ({
  documentType,
  displaySettings,
  onDisplaySettingChange,
  taxRates = [],
  disabled = false,
  showPhaseSettings = true,
  showTaxSettings = true,
  contentScope = "full",
}: PhaseDisplaySettingsCardProps) => {
  const { t } = useTranslation("offers");
  const defaultTaxSelectOptions = useMemo(
    () => buildDefaultTaxRateSelectOptions(taxRates),
    [taxRates]
  );
  const showDefaultRate =
    !displaySettings.showTaxPerItem && documentType === "offer";

  if (contentScope === "taxOnly") {
    return (
      <>
        {showDefaultRate ? (
          <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)] items-center gap-3 p-4">
            <div className="min-w-0">
              <Label
                className="font-semibold text-sm"
                htmlFor="default-tax-rate-tax-only"
              >
                {t("offers.settings.defaultTaxRate")}
              </Label>
              <p className="text-muted-foreground text-sm">
                {t("offers.settings.defaultTaxRateDescription")}
              </p>
            </div>
            <div className="min-w-0">
              <Select
                disabled={disabled}
                onValueChange={(value) =>
                  onDisplaySettingChange(
                    "defaultTaxRate",
                    Number.parseFloat(value)
                  )
                }
                value={String(displaySettings.defaultTaxRate ?? 0)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {defaultTaxSelectOptions.map((rate, idx) => (
                    <SelectItem
                      key={`${rate.value}-${rate.name}-${idx}`}
                      value={String(rate.value)}
                    >
                      {getTaxRateOptionLabel(rate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        {showDefaultRate ? <SettingsCardSeparator /> : null}
        <div className="flex items-center justify-between p-4">
          <div>
            <Label
              className="font-semibold text-sm"
              htmlFor="show-tax-per-item-tax-only"
            >
              {t(`${documentType}s.settings.taxPerItem`)}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t(`${documentType}s.settings.taxPerItemDescription`)}
            </p>
          </div>
          <Switch
            checked={displaySettings.showTaxPerItem}
            disabled={disabled}
            id="show-tax-per-item-tax-only"
            onCheckedChange={(checked) =>
              onDisplaySettingChange("showTaxPerItem", checked)
            }
          />
        </div>
      </>
    );
  }

  if (contentScope === "phaseOnly") {
    return (
      <>
        <div className="flex items-center justify-between p-4">
          <Label
            className="font-semibold text-sm"
            htmlFor="show-phase-index-po"
          >
            {t(`${documentType}s.settings.showPhaseIndex`)}
          </Label>
          <Switch
            checked={displaySettings.showPhaseIndex}
            disabled={disabled}
            id="show-phase-index-po"
            onCheckedChange={(checked) =>
              onDisplaySettingChange("showPhaseIndex", checked)
            }
          />
        </div>

        {displaySettings.showPhaseIndex ? (
          <>
            <SettingsCardSeparator />
            <div className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm" htmlFor="phase-index-pattern-po">
                  {t(`${documentType}s.settings.phaseIndexPattern`)}
                </Label>
                <PhaseIndexPatternHelp
                  helpText={t(
                    `${documentType}s.settings.phaseIndexPatternHelp`
                  )}
                />
              </div>
              <Input
                className="w-full"
                disabled={disabled}
                id="phase-index-pattern-po"
                onChange={(e) =>
                  onDisplaySettingChange("phaseIndexPattern", e.target.value)
                }
                placeholder="1."
                value={displaySettings.phaseIndexPattern}
              />
              <p className="text-muted-foreground text-xs">
                {t(`${documentType}s.settings.phaseIndexPatternPreview`)}:{" "}
                {formatPhaseIndexPreview(displaySettings.phaseIndexPattern)}
              </p>
            </div>
          </>
        ) : null}

        <SettingsCardSeparator />

        <div className="flex items-center justify-between p-4">
          <div>
            <Label
              className="font-semibold text-sm"
              htmlFor="show-phase-totals-po"
            >
              {t(`${documentType}s.settings.showPhaseTotals`)}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t(`${documentType}s.settings.showPhaseTotalsDescription`)}
            </p>
          </div>
          <Switch
            checked={displaySettings.showPhaseTotals}
            disabled={disabled}
            id="show-phase-totals-po"
            onCheckedChange={(checked) =>
              onDisplaySettingChange("showPhaseTotals", checked)
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {showPhaseSettings && (
        <>
          <div className="flex items-center justify-between p-4">
            <Label className="font-semibold text-sm" htmlFor="show-phase-index">
              {t(`${documentType}s.settings.showPhaseIndex`)}
            </Label>
            <Switch
              checked={displaySettings.showPhaseIndex}
              disabled={disabled}
              id="show-phase-index"
              onCheckedChange={(checked) =>
                onDisplaySettingChange("showPhaseIndex", checked)
              }
            />
          </div>

          {displaySettings.showPhaseIndex && (
            <>
              <SettingsCardSeparator />
              <div className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm" htmlFor="phase-index-pattern">
                    {t(`${documentType}s.settings.phaseIndexPattern`)}
                  </Label>
                  <PhaseIndexPatternHelp
                    helpText={t(
                      `${documentType}s.settings.phaseIndexPatternHelp`
                    )}
                  />
                </div>
                <Input
                  className="w-full"
                  disabled={disabled}
                  id="phase-index-pattern"
                  onChange={(e) =>
                    onDisplaySettingChange("phaseIndexPattern", e.target.value)
                  }
                  placeholder="1."
                  value={displaySettings.phaseIndexPattern}
                />
                <p className="text-muted-foreground text-xs">
                  {t(`${documentType}s.settings.phaseIndexPatternPreview`)}:{" "}
                  {formatPhaseIndexPreview(displaySettings.phaseIndexPattern)}
                </p>
              </div>
            </>
          )}

          <SettingsCardSeparator />
        </>
      )}

      {showTaxSettings && (
        <>
          <div className="flex items-center justify-between p-4">
            <div>
              <Label
                className="font-semibold text-sm"
                htmlFor="show-tax-per-item"
              >
                {t(`${documentType}s.settings.taxPerItem`)}
              </Label>
              <p className="text-muted-foreground text-sm">
                {t(`${documentType}s.settings.taxPerItemDescription`)}
              </p>
            </div>
            <Switch
              checked={displaySettings.showTaxPerItem}
              disabled={disabled}
              id="show-tax-per-item"
              onCheckedChange={(checked) =>
                onDisplaySettingChange("showTaxPerItem", checked)
              }
            />
          </div>
          {!displaySettings.showTaxPerItem && documentType === "offer" && (
            <>
              <SettingsCardSeparator />
              <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)] items-center gap-3 p-4">
                <div className="min-w-0">
                  <Label
                    className="font-semibold text-sm"
                    htmlFor="default-tax-rate"
                  >
                    {t("offers.settings.defaultTaxRate")}
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    {t("offers.settings.defaultTaxRateDescription")}
                  </p>
                </div>
                <div className="min-w-0">
                  <Select
                    disabled={disabled}
                    onValueChange={(value) =>
                      onDisplaySettingChange(
                        "defaultTaxRate",
                        Number.parseFloat(value)
                      )
                    }
                    value={String(displaySettings.defaultTaxRate ?? 0)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultTaxSelectOptions.map((rate, idx) => (
                        <SelectItem
                          key={`${rate.value}-${rate.name}-${idx}`}
                          value={String(rate.value)}
                        >
                          {getTaxRateOptionLabel(rate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <SettingsCardSeparator />
        </>
      )}

      {showPhaseSettings && (
        <div className="flex items-center justify-between p-4">
          <div>
            <Label
              className="font-semibold text-sm"
              htmlFor="show-phase-totals"
            >
              {t(`${documentType}s.settings.showPhaseTotals`)}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t(`${documentType}s.settings.showPhaseTotalsDescription`)}
            </p>
          </div>
          <Switch
            checked={displaySettings.showPhaseTotals}
            disabled={disabled}
            id="show-phase-totals"
            onCheckedChange={(checked) =>
              onDisplaySettingChange("showPhaseTotals", checked)
            }
          />
        </div>
      )}
    </>
  );
};
