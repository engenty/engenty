import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@engenty/ui-core";
import { Plus, Save } from "lucide-react";
import { useState } from "react";

interface InstructionVersionDialogProps {
  disabled?: boolean;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  t: (key: string) => string;
}

export function InstructionVersionDialog({
  disabled = false,
  isSubmitting = false,
  onConfirm,
  t,
}: InstructionVersionDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setReason("");
    }
  };

  const handleConfirm = async () => {
    await onConfirm(reason.trim());
    handleOpenChange(false);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("instructions.addVersion")}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("instructions.versionDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("instructions.versionDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="agent-instruction-version-reason">
            {t("instructions.reasonLabel")}
          </Label>
          <Input
            id="agent-instruction-version-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("instructions.reasonPlaceholder")}
            value={reason}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("actions.close")}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => void handleConfirm()}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            {t("instructions.versionDialogConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
