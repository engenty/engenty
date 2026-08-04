import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import type { InvoiceSettings } from "../api.js";
import { useInvoicesSettingsAgentUiSlice } from "../hooks/use-invoices-agent-ui-slice.js";
import { useInvoicesModuleSecondaryShellNav } from "../hooks/use-invoices-module-secondary-shell-nav.js";
import {
  useInvoiceSettingsQuery,
  useSetInvoiceSettingsMutation,
} from "../queries.js";

const FIELD_CLASS = "space-y-1.5";

export function InvoicesSettingsPage() {
  const { t } = useTranslation("invoices");
  useInvoicesSettingsAgentUiSlice();
  const { data, isLoading } = useInvoiceSettingsQuery();
  const saveMutation = useSetInvoiceSettingsMutation();
  const [form, setForm] = useState<InvoiceSettings | null>(null);

  useEffect(() => {
    if (data && !form) {
      setForm(data);
    }
  }, [data, form]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useInvoicesModuleSecondaryShellNav();
  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings") },
    ],
    [moduleRootCrumb, t]
  );
  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const preview = useMemo(() => {
    if (!form) {
      return "";
    }
    const prefix = form.invoice_id_prefix.replace(
      /\{year\}/g,
      String(new Date().getFullYear())
    );
    return `${prefix}${form.invoice_id_offset + 1}${form.invoice_id_postfix}`;
  }, [form]);

  const set = <K extends keyof InvoiceSettings>(
    key: K,
    value: InvoiceSettings[K]
  ) => setForm((cur) => (cur ? { ...cur, [key]: value } : cur));

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <section className="mx-auto w-full max-w-3xl space-y-4 p-page">
        <Card>
          <CardHeader>
            <CardTitle>{t("settingsTitle")}</CardTitle>
            <CardDescription>{t("settingsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading || !form ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className={FIELD_CLASS}>
                    <label
                      className="font-medium text-sm"
                      htmlFor="invoice-prefix"
                    >
                      {t("settingsNumberPrefix", { defaultValue: "Prefix" })}
                    </label>
                    <Input
                      id="invoice-prefix"
                      onChange={(e) => set("invoice_id_prefix", e.target.value)}
                      value={form.invoice_id_prefix}
                    />
                  </div>
                  <div className={FIELD_CLASS}>
                    <label
                      className="font-medium text-sm"
                      htmlFor="invoice-offset"
                    >
                      {t("settingsNumberOffset", { defaultValue: "Start at" })}
                    </label>
                    <Input
                      id="invoice-offset"
                      onChange={(e) =>
                        set("invoice_id_offset", Number(e.target.value) || 0)
                      }
                      type="number"
                      value={form.invoice_id_offset}
                    />
                  </div>
                  <div className={FIELD_CLASS}>
                    <label
                      className="font-medium text-sm"
                      htmlFor="invoice-postfix"
                    >
                      {t("settingsNumberPostfix", { defaultValue: "Suffix" })}
                    </label>
                    <Input
                      id="invoice-postfix"
                      onChange={(e) =>
                        set("invoice_id_postfix", e.target.value)
                      }
                      value={form.invoice_id_postfix}
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-sm">
                  {t("settingsNumberPreview", {
                    defaultValue: "Next number: {{preview}}",
                    preview,
                  })}
                </p>

                <Separator />

                <div className={FIELD_CLASS}>
                  <label className="font-medium text-sm" htmlFor="invoice-due">
                    {t("settingsDueInDays", {
                      defaultValue: "Payment term (days)",
                    })}
                  </label>
                  <Input
                    className="max-w-[140px]"
                    id="invoice-due"
                    onChange={(e) =>
                      set("due_in_days", Number(e.target.value) || 0)
                    }
                    type="number"
                    value={form.due_in_days}
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    disabled={saveMutation.isPending}
                    onClick={() => form && saveMutation.mutate(form)}
                  >
                    {saveMutation.isPending ? t("saving") : t("saveChanges")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
