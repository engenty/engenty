import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@engenty/ui-core";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { InvoiceListItem } from "../api.js";
import { useInvoiceDataSource } from "../data-source-context.js";
import { getContactsPluginApi } from "../plugins.js";
import {
  useInvoiceModalContactsQuery,
  useUpdateInvoiceMutation,
} from "../queries.js";

interface InvoiceEditModalProps {
  invoice: InvoiceListItem | null;
  onClose: () => void;
  onSaved: (invoice: InvoiceListItem) => void;
}

export function InvoiceEditModal({
  invoice,
  onClose,
  onSaved,
}: InvoiceEditModalProps) {
  const { t } = useTranslation("invoices");
  const dataSource = useInvoiceDataSource();
  const updateMutation = useUpdateInvoiceMutation();
  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);
  const contactsQuery = useInvoiceModalContactsQuery(contactsPlugin);
  const availableEntities = contactsQuery.data ?? [];
  const hasContactsPlugin = Boolean(contactsPlugin);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [content, setContent] = useState("");
  const [sumNetto, setSumNetto] = useState("");
  const [tax, setTax] = useState("");
  const [sumBrutto, setSumBrutto] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSaving = updateMutation.isPending;

  useEffect(() => {
    if (!invoice) {
      return;
    }
    setNumber(invoice.number);
    setDate(invoice.date);
    setDueDate(invoice.dueDate);
    setContent(invoice.content ?? "");
    setSumNetto(String(invoice.sumNetto));
    setTax(String(invoice.tax));
    setSumBrutto(String(invoice.sumBrutto));
    setClientId(invoice.clientId ?? "");
    setError(null);
  }, [invoice]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoice) {
      return;
    }
    setError(null);
    try {
      const updated = await updateMutation.mutateAsync({
        id: invoice.id,
        patch: {
          number: number.trim(),
          date: date.trim(),
          dueDate: dueDate.trim(),
          content: content.trim(),
          sumNetto: Number(sumNetto),
          tax: Number(tax),
          sumBrutto: Number(sumBrutto),
          clientId: hasContactsPlugin
            ? clientId.trim().length > 0
              ? clientId.trim()
              : null
            : undefined,
        },
      });
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("updateFailed"));
    }
  }

  return (
    <Sheet
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(invoice)}
    >
      <SheetContent className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{t("editModalTitle")}</SheetTitle>
          <SheetDescription>{t("editModalDescription")}</SheetDescription>
        </SheetHeader>
        {invoice ? (
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label className="font-medium text-sm">{t("number")}</label>
              <Input
                onChange={(event) => setNumber(event.target.value)}
                required
                value={number}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-medium text-sm">{t("date")}</label>
                <Input
                  onChange={(event) => setDate(event.target.value)}
                  required
                  value={date}
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-sm">{t("dueDate")}</label>
                <Input
                  onChange={(event) => setDueDate(event.target.value)}
                  required
                  value={dueDate}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-medium text-sm">{t("content")}</label>
              <Input
                onChange={(event) => setContent(event.target.value)}
                required
                value={content}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-medium text-sm">{t("netto")}</label>
                <Input
                  onChange={(event) => setSumNetto(event.target.value)}
                  required
                  value={sumNetto}
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-sm">{t("tax")}</label>
                <Input
                  onChange={(event) => setTax(event.target.value)}
                  required
                  value={tax}
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-sm">{t("brutto")}</label>
                <Input
                  onChange={(event) => setSumBrutto(event.target.value)}
                  required
                  value={sumBrutto}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-medium text-sm">{t("client")}</label>
              {hasContactsPlugin ? (
                <select
                  aria-label="Invoice client"
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  onChange={(event) => setClientId(event.target.value)}
                  title="Invoice client"
                  value={clientId}
                >
                  <option value="">{t("noClient")}</option>
                  {availableEntities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.display_name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t("contactsUnavailable")}
                </p>
              )}
            </div>
            {error ? (
              <p className="text-red-700 text-sm dark:text-red-300">
                {t("updateFailedWithError", { error })}
              </p>
            ) : null}
            <div className="flex items-center gap-2 pt-2">
              <Button disabled={isSaving} type="submit">
                {isSaving ? t("saving") : t("saveChanges")}
              </Button>
              <Button onClick={onClose} type="button" variant="outline">
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
