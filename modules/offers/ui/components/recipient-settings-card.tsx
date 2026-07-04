import { useTranslation } from "@engenty/i18n/ui";
import { Button, Textarea } from "@engenty/ui-core";
import {
  Check,
  Eye,
  EyeOff,
  FolderInput,
  Link as LinkIcon,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface EntityDetails {
  address_city?: string | null;
  address_country?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  contact_name?: string | null;
  display_name?: string;
  email?: string | null;
  vat_id?: string | null;
}

interface RecipientSettingsCardProps {
  canManageClient?: boolean;
  clientDetails: EntityDetails;
  clientId?: string | null;
  customInfo: string;
  onChangeClient?: () => void;
  onCustomInfoChange: (value: string) => void;
  onRefreshClient?: () => Promise<void> | void;
  onToggleContactEmail: () => void;
  onToggleContactName: () => void;
  showContactEmail: boolean;
  showContactName: boolean;
}

export function RecipientSettingsCard({
  clientDetails,
  clientId,
  showContactName,
  showContactEmail,
  customInfo,
  canManageClient = false,
  onChangeClient,
  onRefreshClient,
  onToggleContactName,
  onToggleContactEmail,
  onCustomInfoChange,
}: RecipientSettingsCardProps) {
  const { t } = useTranslation("offers");
  const navigate = useNavigate();
  const [refreshState, setRefreshState] = useState<
    "idle" | "loading" | "success"
  >("idle");

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

  const getRefreshButtonIcon = (state: "idle" | "loading" | "success") => {
    if (state === "loading") {
      return (
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      );
    }
    if (state === "success") {
      return <Check className="h-3.5 w-3.5 text-green-600" />;
    }
    return <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card p-4">
      <div className="absolute top-2 right-2 flex gap-1">
        {canManageClient && onChangeClient ? (
          <Button
            className="h-6 w-6"
            onClick={onChangeClient}
            size="icon"
            title={t("changeClient")}
            variant="ghost"
          >
            <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        ) : null}
        {clientId && onRefreshClient ? (
          <Button
            className="h-6 w-6"
            disabled={refreshState === "loading"}
            onClick={() => {
              handleRefreshClick();
            }}
            size="icon"
            title={t("refreshFromClient")}
            variant="ghost"
          >
            {getRefreshButtonIcon(refreshState)}
          </Button>
        ) : null}
        {clientId && (
          <Button
            className="h-6 w-6"
            onClick={() => navigate(`/mdl/contacts/${clientId}`)}
            size="icon"
            title={t("viewClient")}
            variant="ghost"
          >
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>

      <div className="space-y-2 pr-10 text-sm">
        <p className="font-semibold text-foreground">
          {clientDetails.display_name || "—"}
        </p>
        {clientDetails.address_street && (
          <p className="whitespace-pre-line text-foreground">
            {clientDetails.address_street}
          </p>
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
            onChange={(e) => onCustomInfoChange(e.target.value)}
            placeholder={t("recipientCustomInfoPlaceholder")}
            rows={2}
            value={customInfo}
          />
        </div>
      </div>
    </div>
  );
}
