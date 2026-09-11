/**
 * The add-source wizard as a modal.
 *
 * Deliberately large: the wizard's widest steps — the index browser and the
 * analyzer's concept list — are lists people read, and a dialog that makes
 * them scroll in a narrow column is worse than the page it replaced. The
 * dialog caps at the viewport and lets only the step body scroll, so the
 * progress rail and the Back/Next footer never leave the screen.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { SourceCreateWizard } from "./source-create-wizard.js";

export function SourceCreateWizardDialog({
  kbId,
  onOpenChange,
  open,
}: {
  kbId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("kb");
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(88vh,60rem)] max-w-[min(96vw,72rem)] flex-col overflow-hidden sm:max-w-[min(96vw,72rem)]">
        <DialogHeader>
          <DialogTitle>{t("sources.wizard_title")}</DialogTitle>
          <DialogDescription>{t("sources.wizard_subtitle")}</DialogDescription>
        </DialogHeader>
        {/* Remounted per opening: a wizard that reopens on step 4 of an
            abandoned run, pointing at a source someone already deleted, is
            worse than starting over. */}
        {open ? (
          <SourceCreateWizard kbId={kbId} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
