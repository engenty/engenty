import { cn, Input } from "@engenty/ui-core";
import { FolderInput, Link as LinkIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { InvoiceStatus } from "../api.js";
import { InvoiceStatusStepper } from "./invoice-status-stepper.js";

interface InvoiceDocumentHeaderProps {
  clientId?: string | null;
  clientName?: string;
  isReadOnly?: boolean;
  onChangeClient?: () => void;
  onTitleBlur?: () => void;
  onTitleChange: (value: string) => void;
  showChangeClient?: boolean;
  showLinkToClient?: boolean;
  status: InvoiceStatus;
  title: string;
  titlePlaceholder?: string;
}

/**
 * Sticky editor header: recipient topline (with change/link actions) + editable
 * title + status stepper. Mirrors the offers editor's DocumentHeader, adapted to
 * the invoice lifecycle.
 */
export function InvoiceDocumentHeader({
  clientId,
  clientName,
  isReadOnly = false,
  onChangeClient,
  onTitleBlur,
  onTitleChange,
  showChangeClient = false,
  showLinkToClient = true,
  status,
  title,
  titlePlaceholder,
}: InvoiceDocumentHeaderProps) {
  const navigate = useNavigate();
  const showActions =
    (showChangeClient && !isReadOnly) || (showLinkToClient && clientId);

  return (
    <div className="w-full bg-card shadow-bottom shadow-sm">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-2 py-4 sm:px-4">
        {clientName ? (
          <div className="group/client relative inline-flex items-center gap-2">
            <div className="text-muted-foreground text-xs sm:text-sm">
              {clientName}
            </div>
            {showActions ? (
              <div className="ml-2 flex items-center gap-3">
                {showChangeClient && !isReadOnly ? (
                  <FolderInput
                    className="h-3.5 w-3.5 cursor-pointer text-foreground opacity-0 transition-opacity hover:text-foreground/80 group-hover/client:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeClient?.();
                    }}
                  />
                ) : null}
                {showLinkToClient && clientId ? (
                  <LinkIcon
                    className="h-3.5 w-3.5 cursor-pointer text-foreground opacity-0 transition-opacity hover:text-foreground/80 group-hover/client:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/mdl/contacts/${clientId}`);
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <Input
          className={cn(
            "h-auto w-full rounded-none border-none px-0 py-0 font-medium shadow-none transition-colors md:text-lg lg:text-3xl",
            isReadOnly
              ? "bg-transparent text-foreground"
              : "bg-input/30 text-foreground hover:bg-input/60 focus-visible:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
          )}
          disabled={isReadOnly}
          onBlur={onTitleBlur}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          value={title}
        />

        <InvoiceStatusStepper status={status} />
      </div>
    </div>
  );
}
