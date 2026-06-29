import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  getPlaceholdersForDocument,
  type PlaceholderCategory,
  type PlaceholderDef,
} from "../placeholders";

interface PlaceholderHelperDialogProps {
  /** Document type for placeholder list. Default "offer". */
  documentType?: "offer" | "invoice";
  /** Called when user selects a placeholder (dialog closes after) */
  onInsert?: (placeholder: string) => void;
  /** Trigger element - defaults to (i) icon button */
  trigger?: React.ReactNode;
  /** "expandable" = expand in place below hint, "dialog" = modal (default) */
  variant?: "expandable" | "dialog";
}

const CATEGORY_LABELS: Record<PlaceholderCategory, string> = {
  recipient: "placeholders.recipient",
  offer: "placeholders.offer",
  invoice: "placeholders.invoice",
  totals: "placeholders.totals",
  sender: "placeholders.sender",
};

function PlaceholderList({
  onSelect,
  documentType = "offer",
}: {
  /** When provided, clicking a placeholder copies, calls onSelect (e.g. insert), and caller can close dialog */
  onSelect?: (tag: string) => void;
  documentType?: "offer" | "invoice";
}) {
  const { t } = useTranslation("offers");
  const placeholders = getPlaceholdersForDocument(documentType);
  const byCategory = placeholders.reduce(
    (acc, p) => {
      if (!acc[p.category]) {
        acc[p.category] = [];
      }
      acc[p.category].push(p);
      return acc;
    },
    {} as Record<string, PlaceholderDef[]>
  );

  const categories: PlaceholderCategory[] =
    documentType === "invoice"
      ? ["recipient", "invoice", "totals", "sender"]
      : ["recipient", "offer", "totals", "sender"];

  return (
    <div className="space-y-4">
      {categories.map((cat) => {
        const items = byCategory[cat];
        if (!items?.length) {
          return null;
        }
        return (
          <div key={cat}>
            <h4 className="mb-2 font-medium text-sm">
              {t(CATEGORY_LABELS[cat])}
            </h4>
            <div className="flex flex-wrap gap-2">
              {items.map((p) => {
                const tag = `{{${p.key}}}`;
                const handleClick = () => {
                  navigator.clipboard.writeText(tag);
                  toast.success(t("placeholders.copied"));
                  onSelect?.(tag);
                };
                return (
                  <button
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 transition-colors hover:bg-muted/50"
                    key={p.key}
                    onClick={handleClick}
                    title={
                      onSelect
                        ? t("placeholders.clickToCopyAndInsert")
                        : t("placeholders.clickToCopy")
                    }
                    type="button"
                  >
                    <code className="select-none font-mono text-xs">{tag}</code>
                    {onSelect && (
                      <span className="text-muted-foreground text-xs">
                        {t("placeholders.insert")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PlaceholderHelperDialog({
  onInsert,
  trigger,
  variant = "dialog",
  documentType = "offer",
}: PlaceholderHelperDialogProps) {
  const { t } = useTranslation("offers");
  const [open, setOpen] = useState(false);

  const handleSelect = (tag: string) => {
    onInsert?.(tag);
    setOpen(false);
  };

  if (variant === "expandable") {
    return (
      <Collapsible>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs">
            {t("placeholders.hint")}
          </span>
          <CollapsibleTrigger asChild>
            <Button
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="mt-2 rounded-md border bg-muted/30 p-3">
            <p className="mb-3 text-muted-foreground text-xs">
              {t("placeholders.description")}
            </p>
            <div className="max-h-[200px] overflow-y-auto pr-2">
              <PlaceholderList documentType={documentType} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <DialogTrigger asChild>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
            </DialogTrigger>
            <TooltipContent side="top">
              <p>{t("placeholders.helperTooltip")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("placeholders.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {t("placeholders.description")}
        </p>
        <div className="max-h-[320px] overflow-y-auto pr-4">
          <PlaceholderList
            documentType={documentType}
            onSelect={onInsert ? handleSelect : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
