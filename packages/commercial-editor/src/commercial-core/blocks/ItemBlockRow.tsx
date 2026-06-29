import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  NumberStepper,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableCell,
  TableRow,
} from "@engenty/ui-core";
import {
  Copy,
  GripVertical,
  ListIndentDecrease,
  ListIndentIncrease,
  Pencil,
  TextAlignEnd,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_LOCALE,
  formatNumber,
  getTaxRateOptionLabel,
  getUnitDisplayLabel as getUnitLabel,
  type CommercialBlock as OfferBlock,
  sanitizeHtml,
  stripHtmlTags,
  type TaxRate,
  type Unit,
} from "../../types";
import {
  getLineItemSubtype,
  type LineItemSubtype,
} from "../constants/blockDefaults";
import { isValidLineItemDrop } from "../editor";
import { EditableContent } from "../shared/EditableContent";
import { EditableText } from "../shared/EditableText";
import {
  executeInsertionAction,
  getInsertionActionsForGroup,
  groupInsertionActionsByKind,
} from "./insertion-actions";
import { LineItemUnitSelect } from "./LineItemUnitSelect";

interface ItemBlockRowProps {
  block: OfferBlock;
  blocks?: OfferBlock[];
  canDemoteToSubLevel?: boolean;
  currency: string;
  /** Optional display symbol (e.g. €). If set, shown instead of currency code. */
  currencySymbol?: string;
  editingBlockId: string | null;
  hasChildren?: boolean;
  index: number;
  isChild?: boolean;
  isReadOnly: boolean;
  locale?: string;
  offerStatus: string;
  onAddBlockAbove: (index: number, type: string) => OfferBlock | null;
  onAddGroup?: (index: number) => OfferBlock | null;
  onAddLineItemAbove?: (
    index: number,
    subtype: LineItemSubtype
  ) => OfferBlock | null;
  onAddSubItem?: (parentId: string) => OfferBlock | null;
  onDeleteBlock: (index: number) => void;
  onDemoteToSubLevel?: (blockId: string) => void;
  onDuplicateBlock: (index: number) => void;
  onEdit: (index: number, content: any) => void;
  /** Open the edit modal for this line item (normal positions only) */
  onOpenEditModal?: (blockId: string) => void;
  onPromoteToTopLevel?: (blockId: string) => void;
  onSetEditingBlockId: (id: string | null) => void;
  position?: string | null;
  showTaxPerItem?: boolean;
  taxRates: TaxRate[];
  units: Unit[];
}

export const ItemBlockRow = ({
  block,
  index,
  blocks = [],
  isReadOnly,
  offerStatus,
  editingBlockId,
  currency,
  currencySymbol,
  taxRates,
  units,
  showTaxPerItem = false,
  locale = DEFAULT_LOCALE,
  isChild = false,
  hasChildren = false,
  position = null,
  onEdit,
  onSetEditingBlockId,
  onAddBlockAbove,
  onAddLineItemAbove,
  onAddSubItem,
  onAddGroup,
  onPromoteToTopLevel,
  onDemoteToSubLevel,
  canDemoteToSubLevel = false,
  onDuplicateBlock,
  onDeleteBlock,
  onOpenEditModal,
}: ItemBlockRowProps) => {
  const { t } = useTranslation("offers");
  const [menuOpen, setMenuOpen] = useState(false);
  const wasClickedRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [showContentField, setShowContentField] = useState(false);
  const [focusContent, setFocusContent] = useState(false);

  const isEditing = editingBlockId === block.id && offerStatus === "draft";

  const { active, over } = useDndContext();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    disabled: isReadOnly,
  });

  const isInvalidDrop =
    isDragging &&
    active?.id === block.id &&
    over &&
    blocks.length > 0 &&
    !isValidLineItemDrop(blocks, String(active.id), String(over.id));

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : undefined
    ),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  useEffect(() => {
    if (isDragging) {
      wasClickedRef.current = false;
    }
  }, [isDragging]);

  useEffect(() => {
    const _id = block.id;
    return () => {
      setShowContentField(false);
      setFocusContent(false);
    };
  }, [block.id]);

  const contentRecord = (block.content ?? {}) as Record<string, unknown>;
  const unit =
    typeof contentRecord.unit === "string" && contentRecord.unit.trim()
      ? contentRecord.unit
      : "h";
  const subtype = getLineItemSubtype(contentRecord);
  const isTextUnit = unit === "text" || subtype === "text";
  const isFixedUnit = unit === "fixed";
  const isTimeUnit = unit === "h" || unit === "d";
  const quantityStep = isTimeUnit ? 0.25 : 1;
  const quantityStepLarge = isTimeUnit ? 1 : 10;
  const isHeadline = subtype === "headline" || (unit === "text" && hasChildren);
  const isTextSubtype = subtype === "text";
  const isPageBreak = subtype === "page_break";

  const effectiveLocale = locale || DEFAULT_LOCALE;
  const effectiveAmount = isFixedUnit ? 1 : block.content.amount || 0;
  const itemTotal = isTextUnit
    ? 0
    : effectiveAmount * (block.content.cost_per_item || 0);
  const formattedTotal = formatNumber(itemTotal, effectiveLocale);
  const formattedCostPerItem = formatNumber(
    block.content.cost_per_item || 0,
    effectiveLocale
  );
  const hasContent = !!stripHtmlTags(block.content?.content ?? "").trim();
  const hadNonEmptyContentRef = useRef(hasContent);
  const shouldShowContentInput = hasContent || showContentField;
  const shouldAutoCollapseEmptyContent = true;

  useEffect(() => {
    hadNonEmptyContentRef.current = hasContent;
  }, [block.id, hasContent]);

  const handlePointerDown = (e: React.PointerEvent) => {
    wasClickedRef.current = true;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    if (listeners?.onPointerDown) {
      listeners.onPointerDown(e as unknown as React.PointerEvent<Element>);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!(wasClickedRef.current && pointerStartRef.current)) {
      return;
    }
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    const moved = Math.sqrt(dx * dx + dy * dy);
    if (moved < 5 && !isDragging) {
      setMenuOpen(true);
    }
    wasClickedRef.current = false;
    pointerStartRef.current = null;
  };

  const _handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setShowContentField(true);
      setFocusContent(true);
    }
  };

  const getUnitDisplayLabel = (unitValue: string, amount?: number) =>
    getUnitLabel(units, unitValue, amount);

  const renderContextMenu = () => (
    <PopoverContent align="start" className="w-48 p-1">
      <div className="flex flex-col">
        {groupInsertionActionsByKind(
          isChild
            ? getInsertionActionsForGroup("rowChild", {
                allowSubItem: Boolean(onAddSubItem && block.content?.parent_id),
              })
            : getInsertionActionsForGroup("rowTopLevel", {
                allowGroup: Boolean(onAddGroup),
                allowLineItemSubtype: Boolean(onAddLineItemAbove),
                allowSubItem: Boolean(onAddSubItem),
              })
        ).map((section, sectionIndex, sections) => (
          <div key={section.id}>
            {sections.length > 1 && (
              <div className="px-2 py-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {t(
                  section.titleKey("offer"),
                  section.id === "content"
                    ? "Content blocks"
                    : "Line-item blocks"
                )}
              </div>
            )}
            {section.actions.map((action) => {
              const Icon = action.icon;
              const parentId =
                action.id === "sub_item" && isChild
                  ? (block.content?.parent_id ?? null)
                  : action.id === "sub_item"
                    ? block.id
                    : null;
              return (
                <button
                  className="flex w-full items-center px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  key={action.id}
                  onClick={() => {
                    executeInsertionAction({
                      actionId: action.id,
                      atIndex: index,
                      handlers: {
                        addBlockAbove: onAddBlockAbove,
                        addGroup: onAddGroup,
                        addLineItemAbove: onAddLineItemAbove,
                        addSubItem: onAddSubItem,
                      },
                      parentId,
                    });
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {t(action.labelKey("offer"))}
                </button>
              );
            })}
            {sectionIndex < sections.length - 1 && (
              <div className="my-1 h-px bg-border" />
            )}
          </div>
        ))}
        <div className="my-1 h-px bg-border" />
        {(subtype === "position" ||
          subtype === "headline" ||
          subtype === "text") &&
          onOpenEditModal && (
            <button
              className="flex w-full items-center px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onOpenEditModal(block.id);
                setMenuOpen(false);
              }}
              type="button"
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t("common.edit")}
            </button>
          )}
        {isChild && block.content?.parent_id && onPromoteToTopLevel && (
          <button
            className="flex w-full items-center px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onPromoteToTopLevel(block.id);
              setMenuOpen(false);
            }}
            type="button"
          >
            <ListIndentDecrease className="mr-2 h-4 w-4" />
            {t("offers.promoteToTopLevel")}
          </button>
        )}
        {onDemoteToSubLevel &&
          canDemoteToSubLevel &&
          !isChild &&
          subtype === "position" && (
            <button
              className="flex w-full items-center px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onDemoteToSubLevel(block.id);
                setMenuOpen(false);
              }}
              type="button"
            >
              <ListIndentIncrease className="mr-2 h-4 w-4" />
              {t("offers.indent")}
            </button>
          )}
        <button
          className="flex w-full items-center px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            onDuplicateBlock(index);
            setMenuOpen(false);
          }}
          type="button"
        >
          <Copy className="mr-2 h-4 w-4" />
          {t("common.duplicate")}
        </button>
        <button
          className={cn(
            "flex w-full items-center px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
            "text-destructive hover:text-destructive"
          )}
          onClick={() => {
            onDeleteBlock(index);
            setMenuOpen(false);
          }}
          type="button"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("common.delete")}
        </button>
      </div>
    </PopoverContent>
  );

  const renderDragHandle = () => (
    <div className="absolute top-2 -left-7 flex w-7 opacity-0 transition-opacity group-hover:opacity-100">
      <Popover onOpenChange={setMenuOpen} open={menuOpen}>
        <PopoverAnchor asChild>
          <button
            type="button"
            {...attributes}
            className="h-full w-full cursor-grab active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            <GripVertical className="h-7 w-7 rounded p-1.5 text-muted-foreground" />
          </button>
        </PopoverAnchor>
        {renderContextMenu()}
      </Popover>
    </div>
  );

  // Page break row - simple dashed placeholder
  if (isPageBreak) {
    const colSpan = showTaxPerItem ? (isReadOnly ? 5 : 6) : isReadOnly ? 4 : 5;
    return (
      <TableRow
        className={cn(
          "group relative border-muted-foreground/40 border-t border-dashed",
          isDragging && "opacity-50",
          isInvalidDrop &&
            "bg-destructive/10 ring-1 ring-destructive ring-inset"
        )}
        ref={setNodeRef}
        style={style}
      >
        {!isReadOnly && (
          <TableCell className="w-0 p-0">{renderDragHandle()}</TableCell>
        )}
        <TableCell
          className="py-2 text-center text-muted-foreground text-xs"
          colSpan={colSpan + 1}
        >
          — {t("offers.pageBreakLineItem")} —
        </TableCell>
      </TableRow>
    );
  }

  // Headline-Position (group): headline + optional description, same behaviour as other positions
  if (isHeadline) {
    const colSpan = showTaxPerItem ? 5 : 4;
    if (isReadOnly || isEditing) {
      return (
        <TableRow
          className={cn(
            "group relative cursor-pointer hover:bg-muted/30",
            isDragging && "opacity-50",
            isInvalidDrop &&
              "bg-destructive/10 ring-1 ring-destructive ring-inset"
          )}
          onClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
          ref={setNodeRef}
          style={style}
        >
          {!isReadOnly && (
            <TableCell className="w-0 p-0">{renderDragHandle()}</TableCell>
          )}
          <TableCell className="py-2 pr-1 pl-0 align-top text-muted-foreground tabular-nums">
            {position || ""}
          </TableCell>
          <TableCell className="px-1" colSpan={colSpan + 1}>
            <div className="font-semibold">
              {block.content.title || t("offers.groupTitle", "Group")}
            </div>
            {hasContent && (
              <div
                className="rich-text-preview prose prose-sm dark:prose-invert mt-1 max-w-none text-muted-foreground [&>p]:mb-0"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(block.content.content),
                }}
              />
            )}
          </TableCell>
        </TableRow>
      );
    }
    return (
      <TableRow
        className={cn(
          "group relative",
          isDragging && "opacity-50",
          isInvalidDrop &&
            "bg-destructive/10 ring-1 ring-destructive ring-inset"
        )}
        ref={setNodeRef}
        style={style}
      >
        <TableCell className="w-0 p-0">{renderDragHandle()}</TableCell>
        <TableCell className="px-1 py-3 pr-1 pl-0 align-top text-muted-foreground tabular-nums">
          {position || ""}
        </TableCell>
        <TableCell className="px-1 align-top" colSpan={colSpan + 1}>
          <div className="relative flex min-h-8 w-full items-center rounded">
            <EditableText
              as="span"
              autoSelect={false}
              className="block min-h-8 min-w-0 flex-1 py-1.5 pr-8 font-semibold text-base leading-none"
              disabled={isReadOnly}
              isPreview={isReadOnly || isEditing}
              onEnter={(e) => {
                e.preventDefault();
                setShowContentField(true);
                setFocusContent(true);
              }}
              onPreviewClick={() =>
                !isReadOnly && onSetEditingBlockId(block.id)
              }
              onSave={(text) => {
                onEdit(index, { ...block.content, title: text });
                onSetEditingBlockId(null);
              }}
              onUpdate={(text) => {
                onEdit(index, { ...block.content, title: text });
              }}
              placeholder={t("offers.headlinePlaceholder", "Headline...")}
              value={block.content.title || ""}
            />
            {!(isReadOnly || shouldShowContentInput) && (
              <button
                aria-label={t("offers.addDescription", "Add description")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  setShowContentField(true);
                  setFocusContent(true);
                }}
                title={t("offers.addDescription", "Add description")}
                type="button"
              >
                <TextAlignEnd className="h-4 w-4" />
              </button>
            )}
          </div>
          {shouldShowContentInput && (
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
                autoFocus={focusContent && !isEditing}
                content={block.content.content || ""}
                disabled={isReadOnly || isEditing}
                hideHeadings
                isPreview={isReadOnly || isEditing}
                onChange={(content) => {
                  onEdit(index, { ...block.content, content });
                  if (!shouldAutoCollapseEmptyContent) {
                    return;
                  }
                  const nextHasContent =
                    stripHtmlTags(content || "").trim().length > 0;
                  const hadNonEmpty = hadNonEmptyContentRef.current;
                  if (!nextHasContent && hadNonEmpty) {
                    setShowContentField(false);
                  }
                  hadNonEmptyContentRef.current = nextHasContent;
                }}
                onPreviewClick={() =>
                  !isReadOnly && onSetEditingBlockId(block.id)
                }
                placeholder={t("offers.itemContent", "Description...")}
              />
            </div>
          )}
        </TableCell>
      </TableRow>
    );
  }

  // Text-Position: just tiptap text (full width), no headline, no unit. Aligns with headline (position column empty).
  if (isTextSubtype) {
    const colSpan = showTaxPerItem ? 5 : 4;
    if (isReadOnly || isEditing) {
      return (
        <TableRow
          className={cn(
            "group relative cursor-pointer hover:bg-muted/30",
            isDragging && "opacity-50",
            isInvalidDrop &&
              "bg-destructive/10 ring-1 ring-destructive ring-inset"
          )}
          onClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
          ref={setNodeRef}
          style={style}
        >
          {!isReadOnly && (
            <TableCell className="w-0 p-0">{renderDragHandle()}</TableCell>
          )}
          <TableCell className="w-12 py-2 pr-1 pl-0 align-top text-muted-foreground tabular-nums" />
          <TableCell className="px-1 py-2" colSpan={colSpan}>
            {hasContent ? (
              <div
                className="rich-text-preview prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&>p]:mb-0"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(block.content.content),
                }}
              />
            ) : (
              <span className="text-muted-foreground/60">
                {t("offers.textLineItemPlaceholder", "Text...")}
              </span>
            )}
          </TableCell>
        </TableRow>
      );
    }
    return (
      <TableRow
        className={cn(
          "group relative",
          isDragging && "opacity-50",
          isInvalidDrop &&
            "bg-destructive/10 ring-1 ring-destructive ring-inset"
        )}
        ref={setNodeRef}
        style={style}
      >
        {!isReadOnly && (
          <TableCell className="w-0 p-0">{renderDragHandle()}</TableCell>
        )}
        <TableCell className="w-12 py-2 pr-1 pl-0 align-top text-muted-foreground tabular-nums" />
        <TableCell className="px-1 py-2 align-top" colSpan={colSpan}>
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
            content={block.content.content || ""}
            disabled={isReadOnly || isEditing}
            hideHeadings
            isPreview={isReadOnly || isEditing}
            onChange={(content) => onEdit(index, { ...block.content, content })}
            onPreviewClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
            placeholder={t("offers.textLineItemPlaceholder", "Text...")}
          />
        </TableCell>
      </TableRow>
    );
  }

  // Read-only display row
  if (isReadOnly || isEditing) {
    return (
      <TableRow
        className={cn(
          "group relative cursor-pointer hover:bg-muted/30",
          isDragging && "opacity-50",
          isInvalidDrop &&
            "bg-destructive/10 ring-1 ring-destructive ring-inset"
        )}
        onClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
        ref={setNodeRef}
        style={style}
      >
        {!isReadOnly && (
          <TableCell className="w-0 p-0">{renderDragHandle()}</TableCell>
        )}
        <TableCell className="py-3 pr-1 pl-0 align-top text-muted-foreground tabular-nums">
          {position || ""}
        </TableCell>
        <TableCell className="px-1">
          <div className="font-medium">
            {block.content.title || t("offers.itemTitle")}
          </div>
          {hasContent && (
            <div
              className="rich-text-preview prose prose-sm dark:prose-invert mt-1 max-w-none text-muted-foreground [&>p]:mb-0"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(block.content.content),
              }}
            />
          )}
        </TableCell>
        <TableCell className="pr-1 pl-1">
          <div className="flex items-center gap-0.5">
            <span className="text-center tabular-nums">
              {isTextUnit || isFixedUnit ? "" : block.content.amount || 1}
            </span>
            <span>{getUnitDisplayLabel(unit, effectiveAmount)}</span>
          </div>
        </TableCell>
        <TableCell className="pl-1 text-right tabular-nums">
          {isTextUnit ? "" : formattedCostPerItem}
        </TableCell>
        {showTaxPerItem && (
          <TableCell className="pl-1 text-center">
            {isTextUnit ? "" : `${block.content.tax || 20}%`}
          </TableCell>
        )}
        <TableCell className="pl-1 text-right align-top font-medium tabular-nums">
          <div className="flex h-8 items-center justify-end">
            <span>{isTextUnit ? "" : formattedTotal}</span>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  // Edit mode row
  return (
    <TableRow
      className={cn(
        "group relative",
        isDragging && "opacity-50",
        isInvalidDrop && "bg-destructive/10 ring-1 ring-destructive ring-inset"
      )}
      ref={setNodeRef}
      style={style}
    >
      <TableCell className="w-0 p-0">{renderDragHandle()}</TableCell>
      <TableCell className="py-3 pr-1 pl-0 align-top text-muted-foreground tabular-nums">
        {position || ""}
      </TableCell>
      <TableCell
        className={cn("px-1 align-top", isChild && "relative pl-3.25")}
      >
        <div
          className={cn(
            isChild && "absolute top-2 bottom-2 left-1 w-0.25 bg-border"
          )}
        />
        <div className="relative flex min-h-8 w-full items-center rounded">
          <EditableText
            as="span"
            autoSelect={false}
            className="block min-h-8 min-w-0 flex-1 py-1.5 pr-8 font-medium text-base leading-normal"
            disabled={isReadOnly}
            isPreview={isReadOnly || isEditing}
            onEnter={(e) => {
              e.preventDefault();
              setShowContentField(true);
              setFocusContent(true);
            }}
            onPreviewClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
            onSave={(text) => {
              onEdit(index, { ...block.content, title: text });
              onSetEditingBlockId(null);
            }}
            onUpdate={(text) => {
              onEdit(index, { ...block.content, title: text });
            }}
            placeholder={t("offers.itemTitle")}
            value={block.content.title || ""}
          />
          {!(isReadOnly || shouldShowContentInput) && (
            <button
              aria-label={t("offers.addDescription", "Add description")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setShowContentField(true);
                setFocusContent(true);
              }}
              title={t("offers.addDescription", "Add description")}
              type="button"
            >
              <TextAlignEnd className="h-4 w-4" />
            </button>
          )}
        </div>
        {shouldShowContentInput && (
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
              autoFocus={focusContent && !isEditing}
              content={block.content.content || ""}
              disabled={isReadOnly || isEditing}
              hideHeadings
              isPreview={isReadOnly || isEditing}
              onChange={(content) => {
                onEdit(index, { ...block.content, content });
                if (!shouldAutoCollapseEmptyContent) {
                  return;
                }
                const nextHasContent =
                  stripHtmlTags(content || "").trim().length > 0;
                const hadNonEmpty = hadNonEmptyContentRef.current;
                if (!nextHasContent && hadNonEmpty) {
                  setShowContentField(false);
                }
                hadNonEmptyContentRef.current = nextHasContent;
              }}
              onPreviewClick={() =>
                !isReadOnly && onSetEditingBlockId(block.id)
              }
              placeholder={t("offers.itemContent", "Description...")}
            />
          </div>
        )}
      </TableCell>
      <TableCell className="pr-1 pl-1 align-top">
        <div className="flex items-center justify-end gap-2">
          {isTextUnit || isFixedUnit ? null : (
            <NumberStepper
              aria-label={t("offers.quantity")}
              className="w-14 border-0 bg-transparent px-0 shadow-none"
              inputClassName="h-8 w-14 rounded-none border-none bg-input/30 text-right text-base leading-none shadow-none ring-offset-0 focus-visible:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 md:text-base"
              max={10_000}
              min={-10_000}
              onChange={(v) => onEdit(index, { ...block.content, amount: v })}
              showButtons={false}
              step={quantityStep}
              stepLarge={quantityStepLarge}
              value={
                typeof block.content.amount === "number"
                  ? block.content.amount
                  : 0
              }
            />
          )}
          <LineItemUnitSelect
            onValueChange={(value) =>
              onEdit(index, { ...block.content, unit: value })
            }
            selectedLabel={getUnitDisplayLabel(unit, effectiveAmount)}
            triggerClassName="h-8 w-full min-w-24 rounded-none border-none bg-input/30 p-0 px-1 text-base shadow-none ring-offset-0 focus:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 [&>svg]:opacity-0 hover:[&>svg]:opacity-100"
            units={units}
            value={unit}
          />
        </div>
      </TableCell>
      <TableCell className="justify-end px-1 pr-0 align-top">
        {isTextUnit ? null : (
          <NumberStepper
            aria-label={t("offers.unitPrice")}
            className="w-full border-0 bg-transparent px-0 shadow-none"
            inputClassName="h-8 w-full rounded-none border-none bg-input/30 p-0 px-0 text-right text-base leading-none shadow-none ring-offset-0 focus-visible:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 md:text-base"
            max={10_000_000}
            min={-10_000_000}
            onChange={(v) =>
              onEdit(index, { ...block.content, cost_per_item: v })
            }
            showButtons={false}
            step={1}
            stepLarge={10}
            value={Number(block.content.cost_per_item) || 0}
          />
        )}
      </TableCell>
      {showTaxPerItem && (
        <TableCell className="pl-1 align-top">
          {isTextUnit ? null : (
            <Select
              onValueChange={(value) =>
                onEdit(index, {
                  ...block.content,
                  tax: Number.parseFloat(value),
                })
              }
              value={String(block.content.tax ?? taxRates[0]?.value ?? 0)}
            >
              <SelectTrigger className="h-8 w-16 border-none bg-input/30 px-1 text-base shadow-none ring-offset-0 focus:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 [&>svg]:opacity-0 hover:[&>svg]:opacity-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {taxRates.some((r) => r.value === 0) ? null : (
                  <SelectItem value="0">0%</SelectItem>
                )}
                {taxRates.map((rate, idx) => (
                  <SelectItem
                    key={`${rate.name}-${rate.value}-${idx}`}
                    value={String(rate.value)}
                  >
                    {getTaxRateOptionLabel(rate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </TableCell>
      )}
      <TableCell className="pr-0 pl-1 text-right align-top font-medium text-base">
        {!isTextUnit && (
          <div className="flex h-8 items-center justify-end">
            <span>{formattedTotal}</span>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
};
