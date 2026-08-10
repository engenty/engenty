import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, Popover, PopoverAnchor, PopoverContent } from "@engenty/ui-core";
import {
  Copy,
  GripVertical,
  Settings,
  SquareChartGantt,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CommercialBlock as OfferBlock, TaxRate, Unit } from "../../types";
import {
  isContentHeadlineBlock,
  isPhaseHeadlineBlock,
} from "../constants/blockDefaults";
import { HeadlineBlock } from "./HeadlineBlock";
import { HeadlineBlockSettingsDialog } from "./HeadlineBlockSettingsDialog";
import { HeadlineEditDialog } from "./HeadlineEditDialog";
import { ItemBlock } from "./ItemBlock";
import {
  executeInsertionAction,
  getInsertionActionsForGroup,
  groupInsertionActionsByKind,
} from "./insertion-actions";
import { TextBlock } from "./TextBlock";
import { TextBlockEditDialog } from "./TextBlockEditDialog";

interface PhaseContext {
  isFirstInPhase: boolean;
  isInPhase: boolean;
  isLastInPhase: boolean;
  phaseIndex: number | null;
}

export type DocumentType = "offer" | "invoice";

interface BlockRendererProps {
  block: OfferBlock;
  blockPosition?: "content_before" | "items" | "content_after";
  currency: string;
  /** Optional display symbol (e.g. €). If set, shown instead of currency code. */
  currencySymbol?: string;
  /** Document type for i18n and behavior. Default "offer". */
  documentType?: DocumentType;
  editingBlockId: string | null;
  index: number;
  isReadOnly: boolean;
  /** Locale for number formatting (e.g. de-DE). */
  locale?: string;
  offerSettings?: {
    show_phase_index?: boolean;
    phase_index_pattern?: string;
    show_tax_per_item?: boolean;
    default_tax_rate?: number;
    show_phase_totals?: boolean;
  } | null;
  /** Status (draft, sent, etc.). Passed as documentStatus to shared components. */
  offerStatus: string;
  onAddBlockAbove: (index: number, type: string) => OfferBlock | null;
  onAddGroup?: (index: number) => OfferBlock | null;
  onAddLineItemAbove?: (
    index: number,
    subtype: "position" | "headline" | "text" | "page_break"
  ) => OfferBlock | null;
  onDeleteBlock: (index: number) => void;
  onDuplicateBlock: (index: number) => void;
  onEdit: (index: number, content: any) => void;
  onSetEditingBlockId: (id: string | null) => void;
  phaseContext: PhaseContext | null;
  phaseNumber: number | null;
  phasesEnabled?: boolean;
  sectionIndex?: number | null;
  taxRates: TaxRate[];
  units: Unit[];
}

export const BlockRenderer = ({
  block,
  index,
  phaseNumber,
  phaseContext,
  isReadOnly,
  phasesEnabled = true,
  documentType = "offer",
  offerStatus,
  editingBlockId,
  currency,
  currencySymbol,
  locale,
  taxRates,
  units,
  offerSettings,
  blockPosition,
  sectionIndex = null,
  onEdit,
  onSetEditingBlockId,
  onAddBlockAbove,
  onAddLineItemAbove,
  onAddGroup,
  onDuplicateBlock,
  onDeleteBlock,
}: BlockRendererProps) => {
  const { t } = useTranslation("offers");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [textEditOpen, setTextEditOpen] = useState(false);
  const wasClickedRef = useRef(false);

  const hasBlockSettings = isPhaseHeadlineBlock(block);

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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
    ),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  // Reset click state if drag starts
  useEffect(() => {
    if (isDragging) {
      wasClickedRef.current = false;
    }
  }, [isDragging]);

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

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

  const pfx = documentType === "invoice" ? "invoices" : "offers";
  const insertionActions = getInsertionActionsForGroup("blockMenu", {
    allowPhase: phasesEnabled,
    allowGroup: Boolean(onAddGroup),
    allowLineItemSubtype: Boolean(onAddLineItemAbove),
  });
  const insertionSections = groupInsertionActionsByKind(insertionActions);

  const commonProps = {
    block,
    index,
    isReadOnly,
    documentStatus: offerStatus,
    documentType,
    editingBlockId,
    onEdit,
    onSetEditingBlockId,
    onAddBlockAbove,
  };

  const headlineProps = {
    ...commonProps,
    sectionIndex,
    phaseNumber,
    documentSettings: offerSettings,
    documentType,
    isPhaseHeadline: isPhaseHeadlineBlock(block),
    onOpenSettings: hasBlockSettings ? () => setSettingsOpen(true) : undefined,
  };

  return (
    <div key={block.id} ref={setNodeRef} style={style}>
      <div
        className={`group relative transition-all ${(block.type === "headline" || isPhaseHeadlineBlock(block)) && index > 0 ? "mt-8" : ""} ${isDragging ? "opacity-50" : ""}`}
      >
        {!isReadOnly && (
          <div className="absolute top-0 -left-7 flex min-h-8 w-7 items-start pt-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Popover onOpenChange={setMenuOpen} open={menuOpen}>
              <PopoverAnchor asChild>
                <button
                  {...attributes}
                  className="cursor-grab rounded p-1 active:cursor-grabbing"
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  title={t("common.dragToReorder")}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverAnchor>
              <PopoverContent align="start" className="w-48 p-1">
                <div className="flex flex-col">
                  <div className="px-2 py-1 font-medium text-muted-foreground text-xs">
                    {t(`${pfx}.addBlock`)}
                  </div>
                  {insertionSections.map((section, sectionIndex) => (
                    <div key={section.id}>
                      {insertionSections.length > 1 && (
                        <div className="px-2 py-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          {t(
                            section.titleKey(documentType),
                            section.id === "content"
                              ? "Content blocks"
                              : "Line-item blocks"
                          )}
                        </div>
                      )}
                      {section.actions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                            key={action.id}
                            onClick={() => {
                              executeInsertionAction({
                                actionId: action.id,
                                atIndex: index,
                                handlers: {
                                  addBlockAbove: onAddBlockAbove,
                                  addGroup: onAddGroup,
                                  addLineItemAbove: onAddLineItemAbove,
                                },
                              });
                              setMenuOpen(false);
                            }}
                          >
                            <Icon className="mr-2 h-4 w-4" />
                            {t(action.labelKey(documentType))}
                          </button>
                        );
                      })}
                      {sectionIndex < insertionSections.length - 1 && (
                        <div className="my-1 h-px bg-border" />
                      )}
                    </div>
                  ))}
                  <div className="my-1 h-px bg-border" />
                  {(hasBlockSettings ||
                    isContentHeadlineBlock(block) ||
                    block.type === "text") && (
                    <button
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        if (block.type === "text") {
                          setTextEditOpen(true);
                        } else {
                          setSettingsOpen(true);
                        }
                        setMenuOpen(false);
                      }}
                    >
                      {hasBlockSettings ? (
                        <SquareChartGantt className="mr-2 h-4 w-4" />
                      ) : (
                        <Settings className="mr-2 h-4 w-4" />
                      )}
                      {t("common.edit")}
                    </button>
                  )}
                  <button
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      onDuplicateBlock(index);
                      setMenuOpen(false);
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("common.duplicate")}
                  </button>
                  <button
                    className={cn(
                      "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
                      "text-destructive hover:text-destructive"
                    )}
                    onClick={() => {
                      onDeleteBlock(index);
                      setMenuOpen(false);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("common.delete")}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
        <div>
          <div className="flex-1">
            {(block.type === "headline" || block.type === "subheading") && (
              <HeadlineBlock {...headlineProps} />
            )}
            {block.type === "text" && (
              <TextBlock {...commonProps} onDelete={onDeleteBlock} />
            )}
            {block.type === "line_item" && (
              <ItemBlock
                {...commonProps}
                currency={currency}
                currencySymbol={currencySymbol}
                locale={locale}
                offerStatus={offerStatus}
                showTaxPerItem={offerSettings?.show_tax_per_item ?? false}
                taxRates={taxRates}
                units={units}
              />
            )}
          </div>
        </div>
      </div>
      {hasBlockSettings && (
        <HeadlineBlockSettingsDialog
          block={block}
          documentType={documentType}
          onOpenChange={setSettingsOpen}
          onSave={(content) => onEdit(index, content)}
          open={settingsOpen}
        />
      )}
      {isContentHeadlineBlock(block) && (
        <HeadlineEditDialog
          block={block}
          documentType={documentType}
          onOpenChange={setSettingsOpen}
          onSave={(content) => onEdit(index, content)}
          open={settingsOpen}
        />
      )}
      {block.type === "text" && (
        <TextBlockEditDialog
          block={block}
          documentType={documentType}
          onOpenChange={setTextEditOpen}
          onSave={(content) => onEdit(index, content)}
          open={textEditOpen}
        />
      )}
    </div>
  );
};
