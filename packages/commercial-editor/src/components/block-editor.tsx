import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown, Plus } from "lucide-react";
import { useMemo } from "react";
import { BlockRenderer } from "../commercial-core/blocks/BlockRenderer.js";
import {
  executeInsertionAction,
  getInsertionActionsForGroup,
  groupInsertionActionsByKind,
} from "../commercial-core/blocks/insertion-actions.js";
import { LineItemsTable } from "../commercial-core/blocks/LineItemsTable.js";
import {
  calculateLineItemsSubtotal,
  getBlockIdsFromGroups,
  groupBlocksForEditor,
} from "../commercial-core/editor/groupBlocksForEditor.js";
import { formatPhaseIndex } from "../commercial-core/utils/formatPhaseIndex.js";
import type { CommercialBlock, TaxRate } from "../types.js";
import { useCommercialBlocks } from "../useCommercialBlocks.js";

export interface BlockEditorProps {
  blocks: CommercialBlock[];
  currency?: string;
  currencySymbol?: string;
  documentStatus?: string;
  documentType?: "offer" | "invoice";
  isReadOnly?: boolean;
  locale?: string;
  offerSettings?: {
    show_phase_index?: boolean;
    phase_index_pattern?: string;
    show_tax_per_item?: boolean;
    default_tax_rate?: number;
    show_phase_totals?: boolean;
  } | null;
  onChange: (blocks: CommercialBlock[]) => void;
  phasesEnabled?: boolean;
  taxRates?: TaxRate[];
  units?: {
    value: string;
    label: string;
    singular?: string;
    is_default: boolean;
  }[];
}

export function BlockEditor({
  blocks,
  onChange,
  documentType = "offer",
  documentStatus = "draft",
  currency = "EUR",
  currencySymbol = "€",
  locale = "de-DE",
  taxRates = [{ name: "vat", label: "20%", value: 20, is_default: true }],
  units: unitsProp,
  offerSettings,
  isReadOnly = false,
  phasesEnabled = true,
}: BlockEditorProps) {
  const { t, i18n } = useTranslation("offers");
  const pfx = `${documentType}s`;
  const units = useMemo(() => {
    if (unitsProp && unitsProp.length > 0) {
      return unitsProp;
    }
    return [
      {
        value: "text",
        label: t(`${pfx}.builtInUnitText`),
        singular: t(`${pfx}.builtInUnitTextSingular`),
        is_default: false,
      },
      {
        value: "fixed",
        label: t(`${pfx}.builtInUnitFixed`),
        singular: t(`${pfx}.builtInUnitFixedSingular`),
        is_default: false,
      },
      {
        value: "h",
        label: t(`${pfx}.builtInUnitHours`),
        singular: t(`${pfx}.builtInUnitHoursSingular`),
        is_default: true,
      },
      {
        value: "d",
        label: t(`${pfx}.builtInUnitDays`),
        singular: t(`${pfx}.builtInUnitDaysSingular`),
        is_default: false,
      },
    ];
  }, [i18n.language, pfx, t, unitsProp]);
  const defaultTax =
    offerSettings?.default_tax_rate ??
    taxRates.find((t) => t.is_default)?.value ??
    20;

  const {
    editingBlockId,
    setEditingBlockId,
    updateBlock,
    addBlockAbove,
    addLineItemAbove,
    addSubItem,
    addGroup,
    promoteToTopLevel,
    demoteToSubLevel,
    deleteBlock,
    duplicateBlock,
    handleDragEnd,
  } = useCommercialBlocks({ blocks, onChange, defaultTax });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const editorGroups = useMemo(
    () => groupBlocksForEditor(blocks as any),
    [blocks]
  );
  const blockIds = useMemo(
    () => getBlockIdsFromGroups(editorGroups as any),
    [editorGroups]
  );
  const blockIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    blocks.forEach((block, index) => map.set(block.id, index));
    return map;
  }, [blocks]);
  const rootInsertionActions = getInsertionActionsForGroup("rootAdd", {
    allowPhase: phasesEnabled,
    allowGroup: true,
    allowLineItemSubtype: true,
  });
  const rootInsertionSections =
    groupInsertionActionsByKind(rootInsertionActions);

  return (
    <div className="space-y-6">
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={blockIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {editorGroups.map((group, groupIndex) => {
              const isPhaseGroup = group.type === "phase";
              const phaseIndex = group.phaseIndex ?? null;
              const phaseLabel =
                isPhaseGroup &&
                phaseIndex !== null &&
                !isReadOnly &&
                offerSettings?.phase_index_pattern
                  ? formatPhaseIndex(
                      offerSettings.phase_index_pattern,
                      phaseIndex + 1
                    )
                  : isPhaseGroup && phaseIndex !== null && !isReadOnly
                    ? `Phase ${phaseIndex + 1}`
                    : null;

              const renderContentBlock = (
                block: CommercialBlock,
                inPhase: boolean,
                sectionIndex?: number | null
              ) => {
                const globalIndex = blockIndexMap.get(block.id) ?? 0;
                const phaseContext =
                  inPhase && group.phaseIndex !== null
                    ? {
                        isInPhase: true,
                        isFirstInPhase: false,
                        isLastInPhase: false,
                        phaseIndex: group.phaseIndex,
                      }
                    : null;

                return (
                  <BlockRenderer
                    block={block as any}
                    blockPosition="content_before"
                    currency={currency}
                    currencySymbol={currencySymbol}
                    documentType={documentType}
                    editingBlockId={editingBlockId}
                    index={globalIndex}
                    isReadOnly={isReadOnly}
                    key={block.id}
                    locale={locale}
                    offerSettings={offerSettings}
                    offerStatus={documentStatus}
                    onAddBlockAbove={addBlockAbove}
                    onAddGroup={addGroup}
                    onAddLineItemAbove={addLineItemAbove}
                    onDeleteBlock={deleteBlock}
                    onDuplicateBlock={duplicateBlock}
                    onEdit={updateBlock}
                    onSetEditingBlockId={setEditingBlockId}
                    phaseContext={phaseContext}
                    phaseNumber={null}
                    phasesEnabled={phasesEnabled}
                    sectionIndex={sectionIndex}
                    taxRates={taxRates}
                    units={units}
                  />
                );
              };

              return (
                <div
                  className={cn(
                    "offer-phase-group relative space-y-0",
                    isPhaseGroup &&
                      !isReadOnly &&
                      "border-r-[3px] border-r-primary pr-2"
                  )}
                  key={`group-${groupIndex}`}
                >
                  {phaseLabel ? (
                    <div className="absolute top-0 -right-[1.25em] z-[2]">
                      <div className="bg-primary px-2 py-0.5 font-medium text-primary-foreground text-xxs [writing-mode:vertical-rl]">
                        {phaseLabel}
                      </div>
                    </div>
                  ) : null}

                  {group.phaseBlock ? (
                    <BlockRenderer
                      block={group.phaseBlock as any}
                      currency={currency}
                      currencySymbol={currencySymbol}
                      documentType={documentType}
                      editingBlockId={editingBlockId}
                      index={blockIndexMap.get(group.phaseBlock.id) ?? 0}
                      isReadOnly={isReadOnly}
                      locale={locale}
                      offerSettings={offerSettings}
                      offerStatus={documentStatus}
                      onAddBlockAbove={addBlockAbove}
                      onAddGroup={addGroup}
                      onAddLineItemAbove={addLineItemAbove}
                      onDeleteBlock={deleteBlock}
                      onDuplicateBlock={duplicateBlock}
                      onEdit={updateBlock}
                      onSetEditingBlockId={setEditingBlockId}
                      phaseContext={{
                        isInPhase: true,
                        isFirstInPhase: true,
                        isLastInPhase: false,
                        phaseIndex: group.phaseIndex,
                      }}
                      phaseNumber={(group.phaseIndex ?? 0) + 1}
                      phasesEnabled={phasesEnabled}
                      sectionIndex={group.phaseSectionIndex}
                      taxRates={taxRates}
                      units={units}
                    />
                  ) : null}

                  {group.segments.map((segment, segmentIndex) => {
                    if (segment.type === "content") {
                      return renderContentBlock(
                        segment.block as any,
                        group.type === "phase",
                        segment.sectionIndex ?? null
                      );
                    }

                    const items = segment.items as any[];
                    const subtotal = calculateLineItemsSubtotal(items as any);
                    return (
                      <div
                        className="space-y-3"
                        key={`line-items-${segmentIndex}-${items[0]?.id ?? "empty"}`}
                      >
                        <LineItemsTable
                          blockIndexMap={blockIndexMap}
                          blocks={blocks as any}
                          currency={currency}
                          currencySymbol={currencySymbol}
                          editingBlockId={editingBlockId}
                          isReadOnly={isReadOnly}
                          items={items as any}
                          locale={locale}
                          offerStatus={documentStatus}
                          onAddBlockAbove={addBlockAbove}
                          onAddGroup={addGroup}
                          onAddLineItemAbove={addLineItemAbove}
                          onAddSubItem={addSubItem}
                          onDeleteBlock={deleteBlock}
                          onDemoteToSubLevel={demoteToSubLevel}
                          onDuplicateBlock={duplicateBlock}
                          onEdit={updateBlock}
                          onPromoteToTopLevel={promoteToTopLevel}
                          onSetEditingBlockId={setEditingBlockId}
                          showSubtotal
                          showTaxPerItem={
                            offerSettings?.show_tax_per_item ?? false
                          }
                          startIndex={0}
                          subtotal={subtotal}
                          taxRates={taxRates}
                          units={units}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {!isReadOnly && (
        <div className="w-full pt-8">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="w-full border-dashed"
                type="button"
                variant="outline"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t(`${pfx}.addBlock`)}
                <ChevronDown className="ml-2 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {rootInsertionSections.map((section, sectionIndex) => (
                <div key={section.id}>
                  {rootInsertionSections.length > 1 && (
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
                      <DropdownMenuItem
                        key={action.id}
                        onClick={() =>
                          executeInsertionAction({
                            actionId: action.id,
                            atIndex: blocks.length,
                            handlers: {
                              addBlockAbove,
                              addGroup,
                              addLineItemAbove,
                            },
                          })
                        }
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {t(action.labelKey(documentType))}
                      </DropdownMenuItem>
                    );
                  })}
                  {sectionIndex < rootInsertionSections.length - 1 && (
                    <div className="my-1 h-px bg-border" />
                  )}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
