import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Switch } from "@engenty/ui-core";
import { Plus, Trash2 } from "lucide-react";
import type { ExpenseCategory } from "../../api.js";
import { getRegionFromLocale } from "../../lib/locale-config.js";
import {
  accountClassFromNumber,
  STANDARD_CATEGORY_PRESETS,
} from "../../lib/region-packs.js";
import { mergeStandardCategoriesForRegion } from "../../lib/standard-category-presets.js";

interface ExpenseCategoriesSectionProps {
  categories: ExpenseCategory[];
  defaultLocale: string;
  onCategoriesChange: (categories: ExpenseCategory[]) => void;
}

const EMPTY_CATEGORY: ExpenseCategory = {
  account_class: null,
  account_number: null,
  code: "",
  name: "",
  is_tax_deductible: false,
  default_deduction_rate: 0,
  llm_hint: null,
  color: null,
  parent_code: null,
  sort_order: 0,
};

export function ExpenseCategoriesSection({
  categories,
  defaultLocale,
  onCategoriesChange,
}: ExpenseCategoriesSectionProps) {
  const { t } = useTranslation("commercial-settings");
  const region = getRegionFromLocale(defaultLocale || "de-AT");
  const regionPresets = STANDARD_CATEGORY_PRESETS[region] ?? [];
  const presetCount = regionPresets.length;
  const presetAddCount = regionPresets.filter(
    (p) => !categories.some((c) => c.code === p.code)
  ).length;
  const accountPlaceholder = regionPresets[0]?.account_number ?? "7340";
  const classPlaceholder = regionPresets[0]?.account_class ?? "7";

  const addCategory = () => {
    onCategoriesChange([
      ...categories,
      { ...EMPTY_CATEGORY, sort_order: categories.length },
    ]);
  };

  const mergePresets = () => {
    onCategoriesChange(mergeStandardCategoriesForRegion(categories, region));
  };

  const removeCategory = (index: number) => {
    onCategoriesChange(categories.filter((_, i) => i !== index));
  };

  const updateCategory = (
    index: number,
    field: keyof ExpenseCategory,
    value: string | number | boolean | null
  ) => {
    const updated = [...categories];
    if (field === "account_number") {
      const number = typeof value === "string" ? value : "";
      updated[index] = {
        ...updated[index],
        account_number: number || null,
        account_class:
          accountClassFromNumber(number) ??
          updated[index].account_class ??
          null,
      };
      onCategoriesChange(updated);
      return;
    }
    updated[index] = { ...updated[index], [field]: value };
    onCategoriesChange(updated);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">
          {t("sections.expenseCategories")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.expenseCategoriesDesc")}
        </p>
      </div>
      <div className="ui-card-panel overflow-hidden">
        <div className="p-4">
          <div className="max-w-4xl space-y-2">
            {/* Column headers */}
            <div className="flex items-center gap-2 px-1 text-muted-foreground text-xs">
              <span className="w-24 shrink-0">
                {t("sections.categoryCode")}
              </span>
              <span className="w-12 shrink-0">
                {t("sections.categoryClass")}
              </span>
              <span className="w-20 shrink-0">
                {t("sections.categoryAccount")}
              </span>
              <span className="min-w-0 flex-1">
                {t("sections.categoryName")}
              </span>
              <span className="w-20 shrink-0 text-center">
                {t("sections.categoryDeductible")}
              </span>
              <span className="w-16 shrink-0 text-right">
                {t("sections.categoryRate")}
              </span>
              <span className="min-w-0 flex-1">
                {t("sections.categoryHint")}
              </span>
              <div className="w-7 shrink-0" />
            </div>

            {categories.map((cat, index) => (
              <div className="flex items-center gap-2" key={index}>
                <Input
                  className="h-8 w-24 shrink-0 font-mono text-sm"
                  onChange={(e) =>
                    updateCategory(index, "code", e.target.value)
                  }
                  placeholder="z.B. reise"
                  value={cat.code}
                />
                <Input
                  className="h-8 w-12 shrink-0 font-mono text-sm"
                  inputMode="numeric"
                  maxLength={1}
                  onChange={(e) =>
                    updateCategory(
                      index,
                      "account_class",
                      e.target.value.replace(/[^0-9]/g, "").slice(0, 1) || null
                    )
                  }
                  placeholder={classPlaceholder}
                  value={cat.account_class ?? ""}
                />
                <Input
                  className="h-8 w-20 shrink-0 font-mono text-sm"
                  onChange={(e) =>
                    updateCategory(
                      index,
                      "account_number",
                      e.target.value || null
                    )
                  }
                  placeholder={accountPlaceholder}
                  value={cat.account_number ?? ""}
                />
                <Input
                  className="h-8 min-w-0 flex-1 text-sm"
                  onChange={(e) =>
                    updateCategory(index, "name", e.target.value)
                  }
                  placeholder={t("sections.categoryName")}
                  value={cat.name}
                />
                <div className="flex w-20 shrink-0 justify-center">
                  <Switch
                    checked={cat.is_tax_deductible}
                    onCheckedChange={(checked) =>
                      updateCategory(index, "is_tax_deductible", checked)
                    }
                  />
                </div>
                <Input
                  className="h-8 w-16 shrink-0 text-right text-sm"
                  disabled={!cat.is_tax_deductible}
                  onChange={(e) =>
                    updateCategory(
                      index,
                      "default_deduction_rate",
                      Number.parseFloat(e.target.value) || 0
                    )
                  }
                  step="0.01"
                  type="number"
                  value={cat.is_tax_deductible ? cat.default_deduction_rate : 0}
                />
                <Input
                  className="h-8 min-w-0 flex-1 text-sm"
                  onChange={(e) =>
                    updateCategory(index, "llm_hint", e.target.value || null)
                  }
                  placeholder={t("sections.categoryHintPlaceholder")}
                  value={cat.llm_hint ?? ""}
                />
                <Button
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeCategory(index)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {categories.length === 0 && (
              <p className="py-4 text-center text-muted-foreground text-sm">
                {t("sections.noCategoriesYet")}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                className="h-7 text-xs"
                onClick={addCategory}
                size="sm"
                variant="outline"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("sections.addCategory")}
              </Button>
              <Button
                className="h-7 text-xs"
                disabled={presetCount === 0}
                onClick={mergePresets}
                size="sm"
                title={
                  presetCount === 0
                    ? t("sections.addStandardCategoriesNone")
                    : undefined
                }
                variant="outline"
              >
                {t("sections.addStandardCategories", { region })}
                {presetAddCount > 0 ? ` (+${presetAddCount})` : ""}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
