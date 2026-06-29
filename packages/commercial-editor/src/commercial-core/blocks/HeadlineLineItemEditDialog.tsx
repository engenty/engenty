import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { CommercialBlock as OfferBlock } from "../../types";
import { RichTextEditor } from "../RichTextEditor";
import { EditDialog } from "../shared/EditDialog";

interface HeadlineLineItemEditDialogProps {
  block: OfferBlock | null;
  onOpenChange: (open: boolean) => void;
  onSave: (content: Record<string, unknown>) => void;
  open: boolean;
}

export const HeadlineLineItemEditDialog = ({
  block,
  open,
  onOpenChange,
  onSave,
}: HeadlineLineItemEditDialogProps) => {
  const { t } = useTranslation("offers");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const position =
    block?.content?.position == null ? "" : String(block.content.position);

  useEffect(() => {
    if (block?.content && open) {
      setTitle(String(block.content.title ?? ""));
      setContent(String(block.content.content ?? ""));
    }
  }, [block, open]);

  const handleSave = () => {
    if (!block) {
      return;
    }
    onSave({
      ...block.content,
      title: title.trim(),
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
        <Label htmlFor="headline-li-position">
          {t("offers.position", "Position")}
        </Label>
        <Input
          className="h-9 bg-muted/30 text-muted-foreground"
          id="headline-li-position"
          readOnly
          value={position}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="headline-li-title">
          {t("offers.headlinePlaceholder", "Headline...")}
        </Label>
        <Input
          className="h-9"
          id="headline-li-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("offers.headlinePlaceholder", "Headline...")}
          value={title}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="headline-li-content">
          {t("offers.itemContent", "Description...")}
        </Label>
        <div className="min-h-[100px] w-full overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <RichTextEditor
            containerClassName="min-h-[100px] rounded-none border-0 focus-within:ring-0"
            content={content}
            hideHeadings
            onChange={setContent}
            placeholder={t("offers.itemContent", "Description...")}
            toolbarVariant="top"
          />
        </div>
      </div>
    </EditDialog>
  );
};
