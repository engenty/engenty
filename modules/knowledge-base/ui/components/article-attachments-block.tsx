/**
 * Article detail — vault original + module attachments (plain list, matches sources row style).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import { FileText } from "lucide-react";
import type { Article, Attachment } from "../../src/schema/types.js";

export function ArticleAttachmentsBlock({
  article,
  downloadingOriginal,
  onDownloadOriginal,
}: {
  article: Article & { attachments?: Attachment[] };
  downloadingOriginal: boolean;
  onDownloadOriginal: () => void;
}) {
  const { t } = useTranslation("kb");
  const hasAttachments =
    (article.attachments && article.attachments.length > 0) ||
    Boolean(article.original_document_name);
  if (!hasAttachments) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="font-medium text-muted-foreground text-sm">
        {t("article.fields.files", "Files")}
      </p>
      <ul className="space-y-2 text-sm">
        {article.original_document_name ? (
          <li className="flex flex-wrap items-start gap-2" key="original">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="break-all font-medium text-foreground leading-snug">
                {article.original_document_name}
              </p>
              <p className="text-muted-foreground text-xs leading-snug">
                {t("article.fields.original_document")}
              </p>
            </div>
            {article.original_document_url ? (
              <div className="flex shrink-0 print:hidden">
                <Button
                  className="h-auto gap-1 px-0 py-0 font-normal text-primary hover:bg-transparent hover:text-primary hover:underline"
                  disabled={downloadingOriginal}
                  onClick={() => onDownloadOriginal()}
                  size="sm"
                  variant="ghost"
                >
                  <AnimatedDownloadIcon
                    className="mr-0.5"
                    play={downloadingOriginal ? "always" : "hover"}
                    size="sm"
                  />
                  {t("article.actions.download_original", "Download")}
                </Button>
              </div>
            ) : null}
          </li>
        ) : null}
        {article.attachments?.map((att) => (
          <li className="flex flex-wrap items-center gap-2" key={att.id}>
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="break-all text-foreground">{att.filename}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
