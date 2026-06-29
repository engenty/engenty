import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { CommercialBlock as OfferBlock } from "../../types";
import { RichTextEditor } from "../RichTextEditor";
import { EditDialog } from "../shared/EditDialog";

interface TextLineItemEditDialogProps {
  block: OfferBlock | null;
  onOpenChange: (open: boolean) => void;
  onSave: (content: Record<string, unknown>) => void;
  open: boolean;
}

export const TextLineItemEditDialog = ({
  block,
  open,
  onOpenChange,
  onSave,
}: TextLineItemEditDialogProps) => {
  const { t } = useTranslation("offers");
  const [content, setContent] = useState("");
  const position =
    block?.content?.position == null ? "" : String(block.content.position);

  useEffect(() => {
    if (block?.content && open) {
      setContent(String(block.content.content ?? ""));
    }
  }, [block, open]);

  const handleSave = () => {
    if (!block) {
      return;
    }
    onSave({
      ...block.content,
      content,
    });
    onOpenChange(false);
  };

  if (!block) {
    return null;
  }

  return (
    <EditDialog
      contentClassName="gap-3"
      onOpenChange={onOpenChange}
      onSave={handleSave}
      open={open}
      title={t("common.edit")}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="text-li-position">
          {t("offers.position", "Position")}
        </Label>
        <Input
          className="h-9 bg-muted/30 text-muted-foreground"
          id="text-li-position"
          readOnly
          value={position}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="text-li-content">
          {t("offers.textLineItemPlaceholder", "Text...")}
        </Label>
        <div className="min-h-[120px] w-full overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <RichTextEditor
            containerClassName="min-h-[120px] rounded-none border-0 focus-within:ring-0"
            content={content}
            hideHeadings
            onChange={setContent}
            placeholder={t("offers.textLineItemPlaceholder", "Text...")}
            toolbarVariant="top"
          />
        </div>
      </div>
    </EditDialog>
  );
};
