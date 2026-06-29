import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Eye, Sparkles } from "lucide-react";
import type { DocumentType } from "./DocumentIntroductionBlock";

interface DocumentDraftToolbarProps {
  /** Trailing content (e.g. offer's approved_at section). */
  children?: React.ReactNode;
  documentType: DocumentType;
  generating?: boolean;
  /** When provided, AI button is enabled. When omitted, AI button is disabled (e.g. invoice). */
  onGenerateWithAI?: () => void;
  onPreview: () => void;
  previewLoading: boolean;
  /** Use scroll-based border (offer style). Default false. */
  useScrollBorder?: boolean;
}

/**
 * Shared draft toolbar for offer/invoice: AI (optional) + PDF preview.
 * Follows offer layout and styling.
 */
export const DocumentDraftToolbar = ({
  documentType,
  onPreview,
  previewLoading,
  onGenerateWithAI,
  generating = false,
  children,
  useScrollBorder = false,
}: DocumentDraftToolbarProps) => {
  const { t } = useTranslation("offers");
  const aiDisabled = !onGenerateWithAI;
  const aiLabelKey = generating ? "offers.generating" : "offers.generateWithAI";

  return (
    <>
      {useScrollBorder && (
        <style>{`
          .document-draft-toolbar-scroll {
            container-type: scroll-state;
          }
          @container scroll-state(stuck: top) {
            .document-draft-toolbar-scroll {
              border-bottom: 1px solid hsl(var(--border));
            }
          }
        `}</style>
      )}
      <div
        className={`document-draft-toolbar-scroll sticky top-0 z-10 mb-6 flex items-center justify-between gap-4 px-2 py-3 backdrop-blur sm:-mx-4 sm:px-4 ${
          useScrollBorder ? "" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
          <Button
            disabled={aiDisabled || generating}
            onClick={onGenerateWithAI}
            size="sm"
            variant="outline"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {t(aiLabelKey)}
          </Button>

          <Button
            disabled={previewLoading}
            onClick={onPreview}
            size="sm"
            variant="outline"
          >
            <Eye className="mr-2 h-4 w-4" />
            {previewLoading ? t("common.loading") : "PDF"}
          </Button>
        </div>

        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </>
  );
};
