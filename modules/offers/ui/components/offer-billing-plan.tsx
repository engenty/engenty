import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Check, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  OfferBillingMilestone,
  OfferBillingPlan,
  OfferBillingPlanMode,
} from "../api.js";
import { formatCurrency } from "../lib/offer-format.js";

interface OfferBillingPlanProps {
  busy?: boolean;
  currency: string;
  gross: number;
  onSave: (plan: OfferBillingPlan) => void;
  value: OfferBillingPlan | null;
}

const MODES: OfferBillingPlanMode[] = [
  "full_on_delivery",
  "deposit_balance",
  "milestones",
];

function defaultMilestones(
  mode: OfferBillingPlanMode,
  label: (key: string) => string
): OfferBillingMilestone[] {
  if (mode === "deposit_balance") {
    return [
      { description: label("billingRowDeposit"), date: null, percent: 50 },
      { description: label("billingRowBalance"), date: null, percent: 50 },
    ];
  }
  if (mode === "milestones") {
    return [{ description: "", date: null, percent: 100 }];
  }
  return [
    { description: label("billingRowOnDelivery"), date: null, percent: 100 },
  ];
}

export function OfferBillingPlanCard({
  busy,
  currency,
  gross,
  onSave,
  value,
}: OfferBillingPlanProps) {
  const { t } = useTranslation("offers");
  const [mode, setMode] = useState<OfferBillingPlanMode>(
    value?.mode ?? "full_on_delivery"
  );
  const [milestones, setMilestones] = useState<OfferBillingMilestone[]>(
    value?.milestones?.length ? value.milestones : defaultMilestones(mode, t)
  );

  useEffect(() => {
    if (value) {
      setMode(value.mode);
      setMilestones(value.milestones);
    }
  }, [value]);

  const changeMode = (next: OfferBillingPlanMode) => {
    setMode(next);
    setMilestones(defaultMilestones(next, t));
  };

  const updateRow = (index: number, patch: Partial<OfferBillingMilestone>) => {
    setMilestones((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const totalPercent = useMemo(
    () => milestones.reduce((sum, m) => sum + (Number(m.percent) || 0), 0),
    [milestones]
  );
  const totalEur = (gross * totalPercent) / 100;
  const matches = Math.abs(totalPercent - 100) < 0.01;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="font-semibold text-lg">{t("billingPlan")}</h2>

        <div className="space-y-1.5">
          <p className="font-medium text-sm">{t("billingMode")}</p>
          <Select
            onValueChange={(v) => changeMode(v as OfferBillingPlanMode)}
            value={mode}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`billingMode_${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_4rem_5rem] gap-2 text-muted-foreground text-xs">
            <span>{t("billingColDescription")}</span>
            <span>{t("billingColDate")}</span>
            <span className="text-right">%</span>
            <span className="text-right">{currency}</span>
          </div>
          {milestones.map((row, index) => (
            <div
              className="grid grid-cols-[1fr_auto_4rem_5rem] items-center gap-2"
              key={index}
            >
              <Input
                className="h-8"
                onChange={(e) =>
                  updateRow(index, { description: e.target.value })
                }
                value={row.description}
              />
              <Input
                className="h-8 w-36"
                onChange={(e) =>
                  updateRow(index, { date: e.target.value || null })
                }
                type="date"
                value={row.date ?? ""}
              />
              <Input
                className="h-8 text-right"
                onChange={(e) =>
                  updateRow(index, { percent: Number(e.target.value) || 0 })
                }
                type="number"
                value={row.percent}
              />
              <span className="flex items-center justify-end gap-1 text-right text-sm">
                {formatCurrency(
                  (gross * (Number(row.percent) || 0)) / 100,
                  currency
                )}
                {mode === "milestones" && milestones.length > 1 ? (
                  <button
                    aria-label={t("billingRemoveRow")}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setMilestones((rows) =>
                        rows.filter((_, i) => i !== index)
                      )
                    }
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </span>
            </div>
          ))}
          {mode === "milestones" ? (
            <Button
              onClick={() =>
                setMilestones((rows) => [
                  ...rows,
                  { description: "", date: null, percent: 0 },
                ])
              }
              size="sm"
              variant="ghost"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t("billingAddRow")}
            </Button>
          ) : null}
        </div>

        <div className="space-y-1 border-t pt-3 text-sm">
          <div className="flex items-center justify-between font-medium">
            <span>{t("billingSum")}</span>
            <span className="flex gap-4">
              <span>{totalPercent}%</span>
              <span className="font-semibold">
                {formatCurrency(totalEur, currency)}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>{t("billingTarget")}</span>
            <span>{formatCurrency(gross, currency)}</span>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 rounded-md p-2 text-sm ${matches ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}
        >
          {matches ? (
            <Check className="h-4 w-4" />
          ) : (
            <TriangleAlert className="h-4 w-4" />
          )}
          {matches ? t("billingMatches") : t("billingMismatch")}
        </div>

        <Button
          className="w-full"
          disabled={busy}
          onClick={() => onSave({ mode, milestones })}
        >
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
