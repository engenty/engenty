import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CommercialSettings,
  Discipline,
  ExpenseCategory,
  TaxRate,
  Unit,
} from "../api.js";
import { CurrencySection } from "../components/settings/currency-section.js";
import { DisciplinesSection } from "../components/settings/disciplines-section.js";
import { ExpenseCategoriesSection } from "../components/settings/expense-categories-section.js";
import { TaxRatesSection } from "../components/settings/tax-rates-section.js";
import { UnitsSection } from "../components/settings/units-section.js";
import { BUILT_IN_NO_TAX } from "../lib/locale-config.js";
import { parseTaxRatesFromApi } from "../lib/parse-tax-rates.js";
import {
  useCommercialSettingsQuery,
  useSetCommercialSettingsMutation,
} from "../queries.js";

export function CommercialSettingsPage() {
  const { t } = useTranslation("commercial-settings");
  const query = useCommercialSettingsQuery();
  const saveMutation = useSetCommercialSettingsMutation();
  const loading = query.isLoading;
  const saving = saveMutation.isPending;
  const [currency, setCurrency] = useState("");
  const [currencySymbol, setCurrencySymbol] = useState("");
  const [numberLocale, setNumberLocale] = useState("");
  const [defaultLocale, setDefaultLocale] = useState("");
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [noTaxReason, setNoTaxReason] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(
    []
  );
  const initialSyncedRef = useRef(false);

  useEffect(() => {
    if (!query.data || initialSyncedRef.current) {
      return;
    }
    initialSyncedRef.current = true;
    const data = query.data;
    const filteredTaxRates = parseTaxRatesFromApi(data.tax_rates).filter(
      (r) => r.value !== 0 || r.name !== BUILT_IN_NO_TAX.name
    );
    setCurrency(data.currency ?? "");
    setCurrencySymbol(data.currency_symbol ?? "");
    setNumberLocale(data.number_locale ?? "");
    setDefaultLocale(data.default_locale ?? "");
    setTaxRates(filteredTaxRates);
    setNoTaxReason(data.no_tax_reason ?? "");
    setUnits((data.units as Unit[]) ?? []);
    setDisciplines((data.disciplines as Discipline[]) ?? []);
    setExpenseCategories((data.expense_categories as ExpenseCategory[]) ?? []);
  }, [query.data]);

  const originalValues = query.data
    ? {
        currency: query.data.currency ?? "",
        currencySymbol: query.data.currency_symbol ?? "",
        numberLocale: query.data.number_locale ?? "",
        defaultLocale: query.data.default_locale ?? "",
        taxRates: parseTaxRatesFromApi(query.data.tax_rates).filter(
          (r) => r.value !== 0 || r.name !== BUILT_IN_NO_TAX.name
        ),
        noTaxReason: query.data.no_tax_reason ?? "",
        units: (query.data.units as Unit[]) ?? [],
        disciplines: (query.data.disciplines as Discipline[]) ?? [],
        expenseCategories:
          (query.data.expense_categories as ExpenseCategory[]) ?? [],
      }
    : null;

  const hasChanges = useMemo(() => {
    if (!originalValues || loading) {
      return false;
    }
    return (
      currency !== originalValues.currency ||
      currencySymbol !== originalValues.currencySymbol ||
      numberLocale !== originalValues.numberLocale ||
      defaultLocale !== originalValues.defaultLocale ||
      JSON.stringify(taxRates) !== JSON.stringify(originalValues.taxRates) ||
      noTaxReason !== originalValues.noTaxReason ||
      JSON.stringify(units) !== JSON.stringify(originalValues.units) ||
      JSON.stringify(disciplines) !==
        JSON.stringify(originalValues.disciplines) ||
      JSON.stringify(expenseCategories) !==
        JSON.stringify(originalValues.expenseCategories)
    );
  }, [
    originalValues,
    currency,
    currencySymbol,
    numberLocale,
    defaultLocale,
    taxRates,
    noTaxReason,
    units,
    disciplines,
    expenseCategories,
    loading,
  ]);

  const saveSettings = async () => {
    const payload: CommercialSettings = {
      currency: currency.trim() || null,
      currency_symbol: currencySymbol.trim() || null,
      number_locale: numberLocale || null,
      default_locale: defaultLocale || null,
      tax_rates: taxRates,
      no_tax_reason: noTaxReason.trim() || null,
      units: units.filter(
        (u) => u?.name != null && String(u.name).trim() !== ""
      ),
      disciplines,
      expense_categories: expenseCategories.filter(
        (c) => c?.code != null && String(c.code).trim() !== ""
      ),
    };
    await saveMutation.mutateAsync(payload);
  };

  const breadcrumbs = useMemo(
    () => [
      { label: t("menu"), to: "/mdl/commercial-settings/settings" },
      { label: t("settings") },
    ],
    [t]
  );
  const pageActions = useMemo(
    () => (
      <Button
        className="h-8 gap-1.5 px-2.5 text-xs"
        disabled={saving || loading || !hasChanges}
        onClick={() => void saveSettings()}
        size="sm"
        variant={hasChanges ? "default" : "outline"}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? t("saving") : t("saveSettings")}
      </Button>
    ),
    [loading, saveSettings, saving, t, hasChanges]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
  });

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-8 p-page">
          <div className="animate-pulse text-muted-foreground text-sm">
            {t("loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-8 p-page">
        <CurrencySection
          currency={currency}
          currencySymbol={currencySymbol}
          defaultLocale={defaultLocale}
          numberLocale={numberLocale}
          onCurrencyChange={setCurrency}
          onCurrencySymbolChange={setCurrencySymbol}
          onDefaultLocaleChange={setDefaultLocale}
          onNumberLocaleChange={setNumberLocale}
        />
        <TaxRatesSection
          defaultLocale={defaultLocale}
          noTaxReason={noTaxReason}
          onNoTaxReasonChange={setNoTaxReason}
          onTaxRatesChange={setTaxRates}
          taxRates={taxRates}
        />
        <UnitsSection onUnitsChange={setUnits} units={units} />
        <DisciplinesSection
          currency={currency}
          disciplines={disciplines}
          onDisciplinesChange={setDisciplines}
        />
        <ExpenseCategoriesSection
          categories={expenseCategories}
          defaultLocale={defaultLocale}
          onCategoriesChange={setExpenseCategories}
        />
      </div>
    </div>
  );
}
