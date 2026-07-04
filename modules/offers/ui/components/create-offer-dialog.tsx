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

interface OfferEntityOption {
  display_name: string;
  id: string;
}

interface CreateOfferDialogProps {
  createError?: string | null;
  createReady?: boolean;
  creating: boolean;
  entities: OfferEntityOption[];
  entitiesAvailable: boolean;
  entitiesLoading: boolean;
  nextOfferNumber: string | null;
  nextOfferNumberLoading: boolean;
  onCreate: (input: {
    title: string;
    clientId: string | null;
  }) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CreateOfferDialog({
  open,
  onOpenChange,
  entities,
  entitiesLoading,
  entitiesAvailable,
  creating,
  createError,
  createReady = true,
  nextOfferNumber,
  nextOfferNumberLoading,
  onCreate,
}: CreateOfferDialogProps) {
  const { t } = useTranslation("offers");
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
  const isTitleMissing = !title.trim();
  const canSubmit =
    createReady && !(creating || isTitleMissing || isClientMissing);

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
          <DialogTitle>{t("createNewOffer")}</DialogTitle>
          {(nextOfferNumberLoading || nextOfferNumber) && (
            <p className="font-mono text-muted-foreground text-sm">
              {t("offerNumber")}:{" "}
              {nextOfferNumberLoading ? "…" : (nextOfferNumber ?? "—")}
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
            <Label htmlFor="create-offer-client">{t("client")}</Label>
            <Select
              disabled={!entitiesAvailable || entitiesLoading || creating}
              onValueChange={(next) => setClientId(next)}
              value={clientId || undefined}
            >
              <SelectTrigger
                className={
                  showErrors && isClientMissing
                    ? "w-full border-destructive"
                    : "w-full"
                }
                id="create-offer-client"
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
                {t("contactsModuleUnavailable")}
              </p>
            )}
          </div>

          {createError ? (
            <p className="text-destructive text-sm" role="alert">
              {createError}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="create-offer-title">{t("offerTitle")}</Label>
            <Input
              className={
                showErrors && isTitleMissing ? "border-destructive" : undefined
              }
              disabled={creating}
              id="create-offer-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("offerTitlePlaceholder")}
              value={title}
            />
          </div>

          <Button className="w-full" disabled={!canSubmit} type="submit">
            {creating ? t("creatingOffer") : t("createOffer")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
