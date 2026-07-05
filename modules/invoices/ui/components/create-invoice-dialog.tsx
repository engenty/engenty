import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";

interface InvoiceEntityOption {
  display_name: string;
  id: string;
}

interface CreateInvoiceDialogProps {
  createError?: string | null;
  createReady?: boolean;
  creating: boolean;
  entities: InvoiceEntityOption[];
  entitiesAvailable: boolean;
  entitiesLoading: boolean;
  nextInvoiceNumber: string | null;
  nextInvoiceNumberLoading: boolean;
  onCreate: (input: {
    title: string;
    clientId: string | null;
  }) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  entities,
  entitiesLoading,
  entitiesAvailable,
  creating,
  createError,
  createReady = true,
  nextInvoiceNumber,
  nextInvoiceNumberLoading,
  onCreate,
}: CreateInvoiceDialogProps) {
  const { t } = useTranslation("invoices");
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setClientId("");
      setShowErrors(false);
    }
  }, [open]);

  const isClientMissing = entitiesAvailable && !clientId;
  const canSubmit = createReady && !(creating || isClientMissing);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setShowErrors(true);
    if (!canSubmit) {
      return;
    }
    await onCreate({ title: title.trim(), clientId: clientId || null });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createNewInvoice")}</DialogTitle>
          {(nextInvoiceNumberLoading || nextInvoiceNumber) && (
            <p className="font-mono text-muted-foreground text-sm">
              {t("number")}:{" "}
              {nextInvoiceNumberLoading ? "…" : (nextInvoiceNumber ?? "—")}
            </p>
          )}
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            handleSubmit(event);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="create-invoice-client">{t("client")}</Label>
            <Select
              disabled={!entitiesAvailable || entitiesLoading || creating}
              onValueChange={(next) => setClientId(next)}
              value={clientId}
            >
              <SelectTrigger
                className={
                  showErrors && isClientMissing
                    ? "w-full border-destructive"
                    : "w-full"
                }
                id="create-invoice-client"
              >
                <SelectValue
                  placeholder={
                    entitiesLoading ? t("loadingContacts") : t("selectClient")
                  }
                >
                  {clientId
                    ? (entities.find((e) => e.id === clientId)?.display_name ??
                      clientId)
                    : entitiesLoading
                      ? t("loadingContacts")
                      : t("selectClient")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {entities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showErrors && isClientMissing ? (
              <p className="text-destructive text-xs">{t("clientRequired")}</p>
            ) : null}
            {entitiesAvailable ? null : (
              <p className="text-muted-foreground text-xs">
                {t("contactsUnavailable")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-invoice-title">{t("invoiceTitle")}</Label>
            <Input
              disabled={creating}
              id="create-invoice-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("invoiceTitlePlaceholder")}
              value={title}
            />
          </div>

          {createError ? (
            <p className="text-destructive text-sm" role="alert">
              {createError}
            </p>
          ) : null}

          <Button className="w-full" disabled={!canSubmit} type="submit">
            {creating ? t("creatingInvoice") : t("createInvoice")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
