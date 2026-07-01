import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";

import type { InsertMarkdownPreference } from "../insert-markdown-preference.js";

interface Props {
  onCancel: () => void;
  onInsert: () => void;
  onPreferenceChange: (value: InsertMarkdownPreference) => void;
  open: boolean;
  preference: InsertMarkdownPreference;
}

/**
 * Uses `Dialog` (not `AlertDialog`) so `Select` and other portalled controls work.
 */
export function InsertConvertedMarkdownDialog({
  open,
  onInsert,
  onCancel,
  preference,
  onPreferenceChange,
}: Props) {
  const { t } = useTranslation("kb");

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              "article.upload.insert_dialog.title",
              "Paste the converted content as markdown into the article?"
            )}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-3 pt-1">
              <div className="space-y-2 text-left">
                <Label className="text-foreground text-xs">
                  {t(
                    "article.upload.insert_dialog.default_label",
                    "Default for future uploads"
                  )}
                </Label>
                <Select
                  onValueChange={(v) =>
                    onPreferenceChange(v as InsertMarkdownPreference)
                  }
                  value={preference}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {preference === "ask"
                        ? t("article.upload.insert_dialog.opt_ask", "Ask")
                        : preference === "always"
                          ? t(
                              "article.upload.insert_dialog.opt_always",
                              "Always"
                            )
                          : t(
                              "article.upload.insert_dialog.opt_always_if_empty",
                              "Always if empty"
                            )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ask">
                      {t("article.upload.insert_dialog.opt_ask", "Ask")}
                    </SelectItem>
                    <SelectItem value="always">
                      {t("article.upload.insert_dialog.opt_always", "Always")}
                    </SelectItem>
                    <SelectItem value="always_if_empty">
                      {t(
                        "article.upload.insert_dialog.opt_always_if_empty",
                        "Always if empty"
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-muted-foreground text-xs">
                {t(
                  "article.upload.insert_dialog.hint",
                  "New content is always added at the end of the article; nothing is replaced."
                )}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button onClick={onCancel} type="button" variant="outline">
            {t("article.upload.insert_dialog.no", "No")}
          </Button>
          <Button onClick={onInsert} type="button">
            {t(
              "article.upload.insert_dialog.insert_button",
              "Insert as content"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
