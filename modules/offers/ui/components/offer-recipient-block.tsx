import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Check, FolderInput, Link as LinkIcon, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OfferListItem } from "../api.js";

interface OfferRecipientBlockProps {
  clientContactName?: string | null;
  clientId?: string | null;
  isReadOnly?: boolean;
  /**
   * Live linked-contact fields used when the offer recipient snapshot is
   * empty (e.g. client linked without a refreshed snapshot).
   */
  linkedContact?: {
    address?: string | null;
    email?: string | null;
    name?: string | null;
  } | null;
  offer: OfferListItem;
  onChangeClient?: () => void;
  onRefreshClient?: () => Promise<void> | void;
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
  linkedContact,
  showChangeClient = false,
  showLinkToClient = true,
  onChangeClient,
  onRefreshClient,
  isReadOnly = false,
}: OfferRecipientBlockProps) {
  const { t } = useTranslation("offers");
  const navigate = useNavigate();
  const [refreshState, setRefreshState] = useState<
    "idle" | "loading" | "success"
  >("idle");

  const companyName =
    offer.recipient_name?.trim() || linkedContact?.name?.trim() || null;
  const address =
    formatDisplayAddress(offer) || linkedContact?.address?.trim() || null;
  const showContactName = offer.show_contact_name !== false;
  const contactName = clientContactName?.trim() || null;
  const showContactEmail = offer.show_contact_email !== false;
  const recipientEmail =
    offer.recipient_email?.trim() || linkedContact?.email?.trim() || null;
  const customInfo = offer.recipient_custom_info?.trim() || null;

  const canChangeClient = showChangeClient && !isReadOnly && onChangeClient;
  const canRefresh = Boolean(clientId && onRefreshClient && !isReadOnly);
  const canLink = Boolean(showLinkToClient && clientId);
  const showActions = canChangeClient || canRefresh || canLink;

  const handleRefreshClick = async () => {
    if (!onRefreshClient || refreshState === "loading") {
      return;
    }
    setRefreshState("loading");
    const startedAt = Date.now();
    try {
      await onRefreshClient();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
      }
      setRefreshState("success");
      setTimeout(() => setRefreshState("idle"), 2000);
    }
  };

  const refreshIcon =
    refreshState === "loading" ? (
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
    ) : refreshState === "success" ? (
      <Check className="h-3.5 w-3.5 text-green-600" />
    ) : (
      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
    );

  return (
    <div className="space-y-1">
      <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
        {t("recipient")}
      </p>

      <div className="group/client-recipient relative inline-flex max-w-full items-start gap-1">
        <p className="min-w-0 font-semibold text-base text-foreground">
          {companyName ?? "—"}
        </p>
        {showActions ? (
          <div className="-mt-0.5 flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/client-recipient:opacity-100">
            {canChangeClient ? (
              <Button
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeClient();
                }}
                size="icon"
                title={t("changeClient")}
                type="button"
                variant="ghost"
              >
                <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            ) : null}
            {canRefresh ? (
              <Button
                className="h-6 w-6"
                disabled={refreshState === "loading"}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRefreshClick();
                }}
                size="icon"
                title={t("refreshFromClient")}
                type="button"
                variant="ghost"
              >
                {refreshIcon}
              </Button>
            ) : null}
            {canLink ? (
              <Button
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/mdl/contacts/${clientId}`);
                }}
                size="icon"
                title={t("viewClient")}
                type="button"
                variant="ghost"
              >
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {address ? (
        <p className="whitespace-pre-line text-foreground text-sm">{address}</p>
      ) : null}

      {showContactName && contactName ? (
        <p className="mt-2 text-foreground text-sm">{contactName}</p>
      ) : null}

      {showContactEmail && recipientEmail ? (
        <p className="text-foreground text-sm">{recipientEmail}</p>
      ) : null}

      {customInfo ? (
        <p className="mt-2 whitespace-pre-line text-foreground text-sm">
          {customInfo}
        </p>
      ) : null}
    </div>
  );
}
