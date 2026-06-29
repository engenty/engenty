import { useTranslation } from "@engenty/i18n/ui";
import { FolderInput, Link as LinkIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type DocumentType = "offer" | "invoice";

interface Recipient {
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

interface DocumentRecipientBlockProps {
  clientId?: string;
  customInfo?: string | null;
  documentType?: DocumentType;
  isReadOnly?: boolean;
  onChangeClient?: () => void;
  recipient: Recipient;
  showChangeClient?: boolean;
  showContactEmail?: boolean;
  showContactName?: boolean;
  showLinkToClient?: boolean;
}

export const DocumentRecipientBlock = ({
  documentType = "invoice",
  recipient,
  showContactName = true,
  showContactEmail = true,
  customInfo,
  clientId,
  showChangeClient = false,
  showLinkToClient = true,
  onChangeClient,
  isReadOnly = false,
}: DocumentRecipientBlockProps) => {
  const { t } = useTranslation("offers");
  const navigate = useNavigate();

  const showActions =
    (showChangeClient && !isReadOnly) || (showLinkToClient && clientId);

  return (
    <div className="space-y-1">
      <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
        {t(`${documentType}s.recipient`)}
      </p>

      <div className="group/client-recipient relative inline-flex items-center gap-2">
        <p className="font-semibold text-base text-foreground">
          {recipient.display_name ?? recipient.company_name ?? "—"}
        </p>
        {showActions && (
          <div className="ml-2 flex items-center gap-3">
            {showChangeClient && !isReadOnly && onChangeClient && (
              <FolderInput
                className="h-3.5 w-3.5 cursor-pointer text-foreground opacity-0 transition-opacity hover:text-foreground/80 group-hover/client-recipient:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeClient();
                }}
              />
            )}
            {showLinkToClient && clientId && (
              <LinkIcon
                className="h-3.5 w-3.5 cursor-pointer text-foreground opacity-0 transition-opacity hover:text-foreground/80 group-hover/client-recipient:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/mdl/contacts/${clientId}`);
                }}
              />
            )}
          </div>
        )}
      </div>

      {recipient.address_street && (
        <p className="text-foreground text-sm">{recipient.address_street}</p>
      )}
      {(recipient.address_zip ||
        recipient.address_city ||
        recipient.address_country) && (
        <p className="text-foreground text-sm">
          {[
            recipient.address_zip,
            recipient.address_city,
            recipient.address_country,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}

      {recipient.vat_id && (
        <p className="text-foreground text-sm">UID {recipient.vat_id}</p>
      )}

      {recipient.contact_name && showContactName && (
        <p className="mt-2 text-foreground text-sm">{recipient.contact_name}</p>
      )}

      {recipient.email && showContactEmail && (
        <p className="text-foreground text-sm">{recipient.email}</p>
      )}

      {customInfo && (
        <p className="mt-2 whitespace-pre-line text-foreground text-sm">
          {customInfo}
        </p>
      )}
    </div>
  );
};
