import { useTranslation } from "@engenty/i18n/ui";
import { FolderInput, Link as LinkIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { OfferListItem } from "../api.js";

interface OfferRecipientBlockProps {
  clientContactName?: string | null;
  clientId?: string | null;
  isReadOnly?: boolean;
  offer: OfferListItem;
  onChangeClient?: () => void;
  showChangeClient?: boolean;
  showLinkToClient?: boolean;
}

function formatDisplayAddress(offer: OfferListItem): string | null {
  const parts: string[] = [];
  if (offer.recipient_address?.trim()) {
    parts.push(offer.recipient_address.trim());
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

export function OfferRecipientBlock({
  offer,
  clientId,
  clientContactName,
  showChangeClient = false,
  showLinkToClient = true,
  onChangeClient,
  isReadOnly = false,
}: OfferRecipientBlockProps) {
  const { t } = useTranslation("offers");
  const navigate = useNavigate();

  const companyName = offer.recipient_name?.trim() || null;
  const address = formatDisplayAddress(offer);
  const showContactName = offer.show_contact_name !== false;
  const contactName = clientContactName?.trim() || null;
  const showContactEmail = offer.show_contact_email !== false;
  const customInfo = offer.recipient_custom_info?.trim() || null;

  const showActions =
    (showChangeClient && !isReadOnly) || (showLinkToClient && clientId);

  return (
    <div className="space-y-1">
      <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
        {t("recipient")}
      </p>

      <div className="group/client-recipient relative inline-flex items-center gap-2">
        <p className="font-semibold text-base text-foreground">
          {companyName ?? "—"}
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

      {address && (
        <p className="whitespace-pre-line text-foreground text-sm">{address}</p>
      )}

      {showContactName && contactName && (
        <p className="mt-2 text-foreground text-sm">{contactName}</p>
      )}

      {showContactEmail && offer.recipient_email && (
        <p className="text-foreground text-sm">{offer.recipient_email}</p>
      )}

      {customInfo && (
        <p className="mt-2 whitespace-pre-line text-foreground text-sm">
          {customInfo}
        </p>
      )}
    </div>
  );
}
