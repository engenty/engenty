import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@engenty/ui-core";
import { Save } from "lucide-react";

/**
 * General edit modal following app best practice:
 * - Title + Save button in header (no footer Cancel/Save)
 * - Compact form layout
 * - Reusable across Bearbeiten/Edit dialogs
 */
interface EditDialogProps {
  children: React.ReactNode;
  className?: string;
  /** Content area className - use for compact spacing */
  contentClassName?: string;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
  /** Disable Save button (e.g. when saving or invalid) */
  saveDisabled?: boolean;
  /** Show saving state on Save button */
  saving?: boolean;
  /** Modal title, e.g. "Überschrift Bearbeiten" or "Phase Bearbeiten" */
  title: string;
}

export const EditDialog = ({
  title,
  open,
  onOpenChange,
  onSave,
  saveDisabled = false,
  saving = false,
  children,
  className,
  contentClassName,
}: EditDialogProps) => {
  const { t } = useTranslation("common");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={cn("gap-0 p-0 sm:max-w-lg", className)}>
        <div className="flex items-center justify-between gap-4 border-b bg-secondary/20 py-2 pr-12 pl-4">
          <DialogTitle className="font-semibold text-lg">{title}</DialogTitle>
          <Button
            className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
            disabled={saveDisabled}
            onClick={onSave}
            size="sm"
            variant="default"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? t("common:saving") : t("common:save")}
          </Button>
        </div>
        <div className={cn("grid gap-3 p-4 pt-6 pb-8", contentClassName)}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
