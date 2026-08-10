import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { SquareChartGantt, TextAlignEnd } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stripHtmlTags } from "../../types";
import { PROSE_LIST_CLASS } from "../constants/editableFormats";
import { EditableContent } from "../shared/EditableContent";
import { EditableText } from "../shared/EditableText";
import { formatPhaseIndex } from "../utils/formatPhaseIndex";

export type DocumentType = "offer" | "invoice";

interface HeadlineBlockProps {
  block: {
    id: string;
    type: string;
    content: { title?: string; content?: string | null };
  };
  documentSettings?: {
    show_phase_index?: boolean;
    phase_index_pattern?: string;
  } | null;
  documentStatus: string;
  documentType?: DocumentType;
  editingBlockId: string | null;
  index: number;
  isPhaseHeadline?: boolean;
  isReadOnly: boolean;
  onAddBlockAbove?: (index: number, type: string) => unknown;
  onEdit: (index: number, content: any) => void;
  onOpenSettings?: () => void;
  onSetEditingBlockId: (id: string | null) => void;
  phaseNumber?: number | null;
  sectionIndex?: number | null;
}

export const HeadlineBlock = ({
  block,
  index,
  isReadOnly,
  documentStatus,
  editingBlockId,
  sectionIndex = null,
  phaseNumber = null,
  documentSettings,
  isPhaseHeadline = false,
  documentType = "offer",
  onEdit,
  onSetEditingBlockId,
  onOpenSettings,
}: HeadlineBlockProps) => {
  const { t } = useTranslation("offers");
  const isEditing = editingBlockId === block.id && documentStatus === "draft";
  const pfx = documentType === "invoice" ? "invoices" : "offers";
  const [showContentField, setShowContentField] = useState(false);
  const [focusContent, setFocusContent] = useState(false);

  const contentText = stripHtmlTags(block.content.content || "");
  const hasContent = contentText.length > 0;
  const hadNonEmptyContentRef = useRef(hasContent);

  useEffect(() => {
    hadNonEmptyContentRef.current = hasContent;
  }, [block.id, hasContent]);

  // Phase heading label: use 1-based phase number so the first phase always shows "1."
  const displayIndex = phaseNumber ?? sectionIndex;
  const showIndex =
    isPhaseHeadline &&
    (documentSettings?.show_phase_index ?? true) &&
    displayIndex != null;
  const indexPattern = documentSettings?.phase_index_pattern ?? "1.";
  const formattedIndex = showIndex
    ? formatPhaseIndex(indexPattern, displayIndex)
    : null;

  const handleTitleEnter = (e: React.KeyboardEvent) => {
    e.preventDefault();
    // Blur to commit the title (triggers onSave), then show content field
    (e.currentTarget as HTMLElement).blur();
    setShowContentField(true);
    setFocusContent(true);
  };

  const titlePlaceholder = isPhaseHeadline
    ? t(`${pfx}.phaseTitle`)
    : t(`${pfx}.headlinePlaceholder`);
  const titleFallback = isPhaseHeadline
    ? t(`${pfx}.phaseTitle`)
    : t(`${pfx}.headline`);

  // Always show text icon when editable (like line items): click shows/focuses heading content
  const showTextIcon = !isReadOnly;
  const hasSettings = Boolean(isPhaseHeadline && onOpenSettings);
  const showSettingsIcon = hasSettings && !isReadOnly;
  const showIcons = showTextIcon || showSettingsIcon;

  return (
    <div>
      <div className="flex items-center gap-2">
        {formattedIndex && (
          <span className="inline-flex min-w-8 shrink-0 items-center justify-end pr-2 font-bold text-foreground text-xl leading-none">
            {formattedIndex}
          </span>
        )}
        <div className="relative flex min-h-8 min-w-0 flex-1 items-center rounded">
          {isReadOnly || isEditing ? (
            isReadOnly ? (
              <h2
                className={cn(
                  "min-h-8 min-w-0 flex-1 rounded py-1.5",
                  !(isPhaseHeadline || hasContent) && "pr-8",
                  isPhaseHeadline && onOpenSettings && "pr-8",
                  isPhaseHeadline
                    ? "bg-input/30 font-bold text-foreground text-xl"
                    : "bg-input/30 font-semibold text-foreground text-lg"
                )}
              >
                {block.content.title || titleFallback}
              </h2>
            ) : (
              <h2
                className={cn(
                  "min-h-8 min-w-0 flex-1 py-1.5",
                  !(isPhaseHeadline || hasContent) && "pr-8",
                  isPhaseHeadline && onOpenSettings && "pr-8",
                  isPhaseHeadline
                    ? "font-bold text-foreground text-xl"
                    : "font-semibold text-foreground text-lg"
                )}
              >
                <button
                  className="min-h-8 w-full cursor-pointer rounded bg-input/30 text-left transition-colors hover:bg-input/60"
                  onClick={() => {
                    onSetEditingBlockId(block.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSetEditingBlockId(null);
                      setShowContentField(true);
                      setFocusContent(true);
                    }
                  }}
                  type="button"
                >
                  {block.content.title || titleFallback}
                </button>
              </h2>
            )
          ) : (
            <EditableText
              as="h2"
              className={cn(
                "block min-h-8 min-w-0 flex-1 py-1.5 text-foreground",
                !(isPhaseHeadline || hasContent) ||
                  (isPhaseHeadline && onOpenSettings)
                  ? "pr-8"
                  : "",
                isPhaseHeadline ? "font-bold text-xl" : "font-semibold text-lg"
              )}
              onEnter={handleTitleEnter}
              onSave={(text) => {
                onEdit(index, { ...block.content, title: text });
                onSetEditingBlockId(null);
              }}
              onUpdate={(text) => {
                onEdit(index, { ...block.content, title: text });
              }}
              placeholder={titlePlaceholder}
              value={block.content.title || ""}
            />
          )}
          {showIcons && (
            <div className="absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center gap-1">
              {showTextIcon && (
                <button
                  aria-label={t(`${pfx}.addDescription`, "Add description")}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-input/60 hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSetEditingBlockId(null);
                    const active = document.activeElement as HTMLElement | null;
                    if (active?.closest?.("[contenteditable]")) {
                      active.blur();
                    }
                    setShowContentField(true);
                    setFocusContent(true);
                  }}
                  title={
                    hasContent
                      ? t(`${pfx}.showDescription`, "Show description")
                      : t(`${pfx}.addDescription`, "Add description")
                  }
                  type="button"
                >
                  <TextAlignEnd className="h-4 w-4" />
                </button>
              )}
              {showSettingsIcon && (
                <button
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-input/60 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSettings?.();
                  }}
                  title={t("common.edit")}
                  type="button"
                >
                  <SquareChartGantt className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {(isReadOnly ? hasContent : hasContent || showContentField) && (
        <div className="mt-2">
          <EditableContent
            allowedFormats={{
              bold: true,
              italic: true,
              underline: true,
              strikethrough: true,
              headings: false,
              lists: true,
              links: true,
            }}
            autoFocus={focusContent}
            content={block.content.content || ""}
            disabled={isReadOnly || isEditing}
            hideHeadings
            isPreview={isReadOnly || isEditing}
            onChange={(content) => {
              onEdit(index, { ...block.content, content });
              const nextHasContent =
                stripHtmlTags(content || "").trim().length > 0;
              const hadNonEmpty = hadNonEmptyContentRef.current;
              // Match line-item UX expectation without collapsing immediately on open.
              if (!nextHasContent && hadNonEmpty) {
                setShowContentField(false);
              }
              hadNonEmptyContentRef.current = nextHasContent;
            }}
            onPreviewClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
            placeholder={
              isPhaseHeadline
                ? t(`${pfx}.phaseContent`, "Phase description...")
                : t(`${pfx}.headlineContentPlaceholder`, "Headline content...")
            }
            previewClassName={cn(
              "prose-sm max-w-none text-muted-foreground",
              PROSE_LIST_CLASS
            )}
          />
        </div>
      )}
    </div>
  );
};
