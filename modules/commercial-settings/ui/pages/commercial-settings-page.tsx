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
import { useCommercialSettingsAgentUiSlice } from "../hooks/use-commercial-settings-agent-ui-slice.js";
import { BUILT_IN_NO_TAX, BUILT_IN_UNIT_KEYS } from "../lib/locale-config.js";
import { parseTaxRatesFromApi } from "../lib/parse-tax-rates.js";
import {
  useCommercialSettingsQuery,
  useSetCommercialSettingsMutation,
} from "../queries.js";

/** Server payload -> the shape the form holds, with built-ins filtered out. */
function toFormValues(data: CommercialSettings) {
  return {
    currency: data.currency ?? "",
    currencySymbol: data.currency_symbol ?? "",
    defaultLocale: data.default_locale ?? "",
    disciplines: (data.disciplines as Discipline[]) ?? [],
    expenseCategories: (data.expense_categories as ExpenseCategory[]) ?? [],
    noTaxReason: data.no_tax_reason ?? "",
    numberLocale: data.number_locale ?? "",
    taxRates: parseTaxRatesFromApi(data.tax_rates).filter(
      (r) => r.value !== 0 || r.name !== BUILT_IN_NO_TAX.name
    ),
    units: ((data.units as Unit[]) ?? []).filter(
      (u) =>
        !BUILT_IN_UNIT_KEYS.includes(
          u.name as (typeof BUILT_IN_UNIT_KEYS)[number]
        )
    ),
  };
}

type CommercialFormValues = ReturnType<typeof toFormValues>;

const snapshot = (values: CommercialFormValues) => JSON.stringify(values);

export function CommercialSettingsPage() {
  const { t } = useTranslation("commercial-settings");
  useCommercialSettingsAgentUiSlice();
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
  // Snapshot of the server state the form currently mirrors. Seeding once and
  // never again meant a write from anywhere else — the copilot's
  // commercial_settings_*_set operations, another tab — refreshed the query but
  // left these inputs showing the values they were mounted with.
  const adoptedRef = useRef<string | null>(null);

  const originalValues = query.data ? toFormValues(query.data) : null;

  const currentValues: CommercialFormValues = {
    currency,
    currencySymbol,
    defaultLocale,
    disciplines,
    expenseCategories,
    noTaxReason,
    numberLocale,
    taxRates,
    units,
  };
  // Read inside the effect without making it a dependency; re-running this on
  // every keystroke would fight the user for the input.
  const currentSnapshotRef = useRef(snapshot(currentValues));
  currentSnapshotRef.current = snapshot(currentValues);

  useEffect(() => {
    if (!query.data) {
      return;
    }
    const incoming = snapshot(toFormValues(query.data));
    if (incoming === adoptedRef.current) {
      return;
    }
    // Unsaved local edits win: adopting here would delete what the user is
    // still typing. They keep editing and their save overwrites, as before.
    if (
      adoptedRef.current !== null &&
      currentSnapshotRef.current !== adoptedRef.current
    ) {
      return;
    }
    adoptedRef.current = incoming;
    const next = toFormValues(query.data);
    setCurrency(next.currency);
    setCurrencySymbol(next.currencySymbol);
    setNumberLocale(next.numberLocale);
    setDefaultLocale(next.defaultLocale);
    setTaxRates(next.taxRates);
    setNoTaxReason(next.noTaxReason);
    setUnits(next.units);
    setDisciplines(next.disciplines);
    setExpenseCategories(next.expenseCategories);
  }, [query.data]);

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
        (u) =>
          u?.name != null &&
          String(u.name).trim() !== "" &&
          !BUILT_IN_UNIT_KEYS.includes(
            u.name as (typeof BUILT_IN_UNIT_KEYS)[number]
          )
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
