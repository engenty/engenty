import { useTranslation } from "@engenty/i18n/ui";
import { Button, Textarea } from "@engenty/ui-core";
import { Eye, EyeOff, FolderInput, Link } from "lucide-react";

interface ClientDetails {
  address_city?: string | null;
  address_country?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  company_name?: string;
  contact_name?: string | null;
  display_name?: string;
  email?: string | null;
  vat_id?: string | null;
}

interface RecipientSettingsCardProps {
  clientDetails: ClientDetails;
  clientId?: string;
  customInfo: string;
  documentType?: "offer" | "invoice";
  onChangeClient?: () => void;
  onCustomInfoBlur?: () => void;
  onCustomInfoChange: (value: string) => void;
  onToggleContactEmail: () => void;
  onToggleContactName: () => void;
  showContactEmail: boolean;
  showContactName: boolean;
}

export const RecipientSettingsCard = ({
  documentType = "offer",
  clientDetails,
  clientId,
  showContactName,
  showContactEmail,
  customInfo,
  onToggleContactName,
  onToggleContactEmail,
  onCustomInfoChange,
  onCustomInfoBlur,
  onChangeClient,
}: RecipientSettingsCardProps) => {
  const { t } = useTranslation("offers");

  const changeClientKey =
    documentType === "offer" ? "offers.changeClient" : "invoices.changeClient";
  const placeholderKey = `${documentType}s.settings.recipientCustomInfoPlaceholder`;

  return (
    <div className="ui-canvas-raised overflow-hidden rounded-lg bg-card p-4">
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-1">
          {(clientDetails.display_name ?? clientDetails.company_name) ? (
            <p className="min-w-0 flex-1 font-semibold text-foreground">
              {clientDetails.display_name ?? clientDetails.company_name}
            </p>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <div className="-mt-1 -mr-1.5 flex shrink-0 gap-1">
            {onChangeClient ? (
              <Button
                className="h-6 w-6"
                onClick={onChangeClient}
                size="icon"
                title={t(changeClientKey)}
                variant="ghost"
              >
                <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            ) : null}
            {clientId ? (
              <Button
                className="h-6 w-6"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.location.href = `/mdl/contacts/${clientId}`;
                  }
                }}
                size="icon"
                title={t("viewClient")}
                variant="ghost"
              >
                <Link className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            ) : null}
          </div>
        </div>
        {clientDetails.address_street && (
          <p className="text-foreground">{clientDetails.address_street}</p>
        )}
        {(clientDetails.address_zip ||
          clientDetails.address_city ||
          clientDetails.address_country) && (
          <p className="text-foreground">
            {[
              clientDetails.address_zip,
              clientDetails.address_city,
              clientDetails.address_country,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        {clientDetails.vat_id && (
          <p className="text-foreground">UID {clientDetails.vat_id}</p>
        )}

        {clientDetails.contact_name && (
          <div className="border-border border-t pt-2">
            <div className="flex items-center justify-between">
              <p
                className={
                  showContactName
                    ? "text-foreground"
                    : "text-muted-foreground/50"
                }
              >
                {clientDetails.contact_name}
              </p>
              <Button
                className="h-6 w-6 shrink-0"
                onClick={onToggleContactName}
                size="icon"
                variant="ghost"
              >
                {showContactName ? (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
        )}

        {clientDetails.email && (
          <div className="flex items-center justify-between border-border border-t pt-2">
            <p
              className={
                showContactEmail
                  ? "text-foreground"
                  : "text-muted-foreground/50"
              }
            >
              {clientDetails.email}
            </p>
            <Button
              className="h-6 w-6 shrink-0"
              onClick={onToggleContactEmail}
              size="icon"
              variant="ghost"
            >
              {showContactEmail ? (
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </div>
        )}

        <div className="border-border border-t pt-2">
          <Textarea
            className="min-h-[60px] resize-none text-sm"
            onBlur={onCustomInfoBlur}
            onChange={(e) => onCustomInfoChange(e.target.value)}
            placeholder={t(placeholderKey)}
            rows={2}
            value={customInfo}
          />
        </div>
      </div>
    </div>
  );
};
