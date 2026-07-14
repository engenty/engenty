import { cn, Input } from "@engenty/ui-core";
import { FolderInput, Link as LinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { InvoiceStatus } from "../api.js";
import { InvoiceStatusStepper } from "./invoice-status-stepper.js";

interface InvoiceDocumentHeaderProps {
  clientId?: string | null;
  clientName?: string;
  /**
   * When true, collapse to a single sticky line: the compact status +
   * a smaller title. The full stack (eyebrow, large title, stepper) fades.
   * Drive from a scroll detector on the page's scroll container.
   */
  collapsed?: boolean;
  /** Compact status (e.g. a badge) shown on the collapsed line. */
  compactStatus?: ReactNode;
  /** Smaller title shown on the collapsed line. */
  compactTitle?: ReactNode;
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
 * Blended editor header: recipient topline (with change/link actions) +
 * editable title + status stepper, collapsing to a single compact line on
 * scroll. Mirrors the offers editor's DocumentHeader, adapted to the invoice
 * lifecycle. Pair with `usePageConfig({ topbarChrome: "contentBlend",
 * topbarOverlap: true })`; `pt-14` clears the ~44px floating topbar.
 */
export function InvoiceDocumentHeader({
  clientId,
  clientName,
  collapsed = false,
  compactStatus,
  compactTitle,
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
    <div className="w-full border-border border-b bg-card">
      <div className="mx-auto w-full max-w-6xl px-2 pt-14 pb-4 sm:px-4">
        {/* Full stack ↔ compact line cross-fade — single-row grids whose height
            animates between 0fr and 1fr (content height); no JS measurement. */}
        <div
          aria-hidden={collapsed}
          className={cn(
            "grid transition-all duration-300 ease-out",
            collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div
            className={cn(
              "min-h-0 overflow-hidden",
              collapsed && "pointer-events-none"
            )}
          >
            <div className="flex flex-col gap-2">
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
        </div>
        <div
          aria-hidden={!collapsed}
          className={cn(
            "grid transition-all duration-300 ease-out",
            collapsed
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div
            className={cn(
              "min-h-0 overflow-hidden",
              !collapsed && "pointer-events-none"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {compactStatus ? (
                <div className="shrink-0">{compactStatus}</div>
              ) : null}
              <span className="min-w-0 truncate font-heading font-semibold text-foreground text-xl leading-tight tracking-tight">
                {compactTitle}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
