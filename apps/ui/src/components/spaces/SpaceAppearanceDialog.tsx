/**
 * Colour and icon, in a modal opened from the space's own tile.
 *
 * The controls used to be a card in the settings column, which put a palette —
 * the least-used thing on the page — above People and Apps, and left the tile
 * itself inert. Hanging the editor off the tile (an edit pen on hover, the same
 * move tenant settings makes on its logo) says what is being edited by pointing
 * at it, and gives the column back to the settings people actually came for.
 *
 * A DRAFT, not live edits: a modal with a Cancel button has to be cancellable,
 * so nothing is written until Save. The page's inline version saved as you
 * clicked, which was right for a card you could not back out of and wrong here.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { SpaceAppearanceValue } from "./SpaceAppearanceFields";
import { SpaceAppearancePicker } from "./SpaceAppearancePicker";

export function SpaceAppearanceDialog({
  name,
  onOpenChange,
  onSave,
  open,
  saving,
  value,
}: {
  name: string;
  onOpenChange: (open: boolean) => void;
  onSave: (next: SpaceAppearanceValue) => void;
  open: boolean;
  saving: boolean;
  value: SpaceAppearanceValue;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState<SpaceAppearanceValue>(value);

  // Seeded on every opening rather than once: reopening after a cancel must
  // start from what the server has, not from the abandoned edit.
  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("spaces.setup.appearanceLabel")}</DialogTitle>
          <DialogDescription>
            {t("spaces.setup.appearanceHint")}
          </DialogDescription>
        </DialogHeader>

        <SpaceAppearancePicker
          key={open ? "open" : "closed"}
          name={name}
          onChange={setDraft}
          value={draft}
        />

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button disabled={saving} onClick={() => onSave(draft)} type="button">
            {saving
              ? t("saving", { defaultValue: "Saving…" })
              : t("save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
