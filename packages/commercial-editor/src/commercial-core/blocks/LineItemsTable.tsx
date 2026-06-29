import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { ChevronDown, ListPlus } from "lucide-react";
import { useState } from "react";
import type { CommercialBlock as OfferBlock, TaxRate, Unit } from "../../types";
import { DEFAULT_LOCALE } from "../../types";
import {
  getLineItemSubtype,
  isSpecialLineItem,
} from "../constants/blockDefaults";
import { HeadlineLineItemEditDialog } from "./HeadlineLineItemEditDialog";
import { ItemBlockRow } from "./ItemBlockRow";
import {
  executeInsertionAction,
  getInsertionActionsForGroup,
  groupInsertionActionsByKind,
} from "./insertion-actions";
import { LineItemEditDialog } from "./LineItemEditDialog";
import { TextLineItemEditDialog } from "./TextLineItemEditDialog";

function isLineItem(block: OfferBlock): boolean {
  return block.type === "line_item";
}

/** Check if block has a previous line_item in the blocks array (demote is applicable) */
function hasPreviousLineItem(blocks: OfferBlock[], blockId: string): boolean {
  const idx = blocks.findIndex((b) => b.id === blockId);
  if (idx <= 0) {
    return false;
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (isLineItem(blocks[i])) {
      return true;
    }
  }
  return false;
}

interface LineItemsTableProps {
  blockIndexMap: Map<string, number>;
  blocks?: OfferBlock[];
  currency: string;
  /** Optional display symbol (e.g. €). If set, shown instead of currency code next to amounts. */
  currencySymbol?: string;
  editingBlockId: string | null;
  isReadOnly: boolean;
  items: OfferBlock[];
  locale?: string;
  offerStatus: string;
  onAddBlockAbove: (index: number, type: string) => OfferBlock | null;
  onAddGroup?: (index: number) => OfferBlock | null;
  onAddLineItemAbove?: (
    index: number,
    subtype: "position" | "headline" | "text" | "page_break"
  ) => OfferBlock | null;
  onAddSubItem?: (parentId: string) => OfferBlock | null;
  onDeleteBlock: (index: number) => void;
  onDemoteToSubLevel?: (blockId: string) => void;
  onDuplicateBlock: (index: number) => void;
  onEdit: (index: number, content: any) => void;
  onPromoteToTopLevel?: (blockId: string) => void;
  onSetEditingBlockId: (id: string | null) => void;
  /** When true, line-item edit modal shows position field (invoice). */
  showPositionField?: boolean;
  showSubtotal?: boolean;
  showTaxPerItem?: boolean;
  startIndex: number;
  subtotal: number;
  taxRates: TaxRate[];
  units: Unit[];
}

/**
 * Build a structured list for rendering: top-level items with their children grouped underneath.
 */
function buildHierarchicalItems(items: OfferBlock[]): {
  block: OfferBlock;
  children: OfferBlock[];
  isChild: boolean;
  hasChildren: boolean;
}[] {
  const childMap = new Map<string, OfferBlock[]>();
  const topLevel: OfferBlock[] = [];

  // First pass: separate top-level from children
  for (const item of items) {
    const parentId = item.content?.parent_id;
    if (parentId) {
      if (!childMap.has(parentId)) {
        childMap.set(parentId, []);
      }
      childMap.get(parentId)?.push(item);
    } else {
      topLevel.push(item);
    }
  }

  // Build result: top-level items followed by their children
  const result: {
    block: OfferBlock;
    children: OfferBlock[];
    isChild: boolean;
    hasChildren: boolean;
  }[] = [];

  for (const parent of topLevel) {
    const children = childMap.get(parent.id) || [];
    result.push({
      block: parent,
      children,
      isChild: false,
      hasChildren: children.length > 0,
    });
    for (const child of children) {
      result.push({
        block: child,
        children: [],
        isChild: true,
        hasChildren: false,
      });
    }
  }

  return result;
}

export const LineItemsTable = ({
  items,
  blocks,
  startIndex,
  currency,
  currencySymbol,
  taxRates,
  units,
  subtotal,
  showSubtotal = true,
  isReadOnly,
  offerStatus,
  editingBlockId,
  showTaxPerItem = false,
  showPositionField = false,
  locale = DEFAULT_LOCALE,
  onEdit,
  onSetEditingBlockId,
  onAddBlockAbove,
  onAddLineItemAbove,
  onAddSubItem,
  onAddGroup,
  onPromoteToTopLevel,
  onDemoteToSubLevel,
  onDuplicateBlock,
  onDeleteBlock,
  blockIndexMap,
}: LineItemsTableProps) => {
  const { t, i18n } = useTranslation("offers");
  const [editingModalBlockId, setEditingModalBlockId] = useState<string | null>(
    null
  );

  const numberFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  if (items.length === 0) {
    return null;
  }

  const hierarchicalItems = buildHierarchicalItems(items);
  const hasNormalLineItems = items.some(
    (item) => !isSpecialLineItem(item.content)
  );
  const footerInsertionActions = getInsertionActionsForGroup("tableFooter", {
    allowGroup: Boolean(onAddGroup),
    allowLineItemSubtype: Boolean(onAddLineItemAbove),
    allowPhase: false,
  });
  const footerInsertionSections = groupInsertionActionsByKind(
    footerInsertionActions
  );
  const editBlock = editingModalBlockId
    ? (items.find((b) => b.id === editingModalBlockId) ?? null)
    : null;
  const editSubtype = editBlock ? getLineItemSubtype(editBlock.content) : null;

  const handleEditModalSave = (content: Record<string, unknown>) => {
    if (editingModalBlockId) {
      const idx = blockIndexMap.get(editingModalBlockId);
      if (idx !== undefined) {
        onEdit(idx, content);
      }
      setEditingModalBlockId(null);
    }
  };
  const handleEditModalOpenChange = (open: boolean) => {
    if (!open) {
      setEditingModalBlockId(null);
    }
  };

  return (
    <div className="relative my-2">
      <Table className="text-base" noWrapper>
        {hasNormalLineItems && (
          <TableHeader>
            <TableRow className="border-border border-b hover:bg-transparent">
              {!isReadOnly && <TableHead className="w-0 p-0" />}
              <TableHead className="w-12 py-3 pr-1 pl-0 align-top">
                {t("offers.position", "Pos")}
              </TableHead>
              <TableHead className="px-1 py-3 align-top">
                {t("offers.description")}
              </TableHead>
              <TableHead className="w-24 pr-1 pl-1">
                {t("offers.quantity")} / {t("offers.unit", "Unit")}
              </TableHead>
              <TableHead className="w-28 px-1 pl-1 text-right">
                {t("offers.unitPrice")}
              </TableHead>
              {showTaxPerItem && (
                <TableHead className="w-16 pl-1 text-center">
                  {t("offers.tax", "Tax")}
                </TableHead>
              )}
              <TableHead className="w-28 pr-0 pl-1 text-right">
                {t("offers.total")}
              </TableHead>
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {hierarchicalItems.map(({ block, isChild, hasChildren }) => {
            const globalIndex = blockIndexMap.get(block.id) ?? 0;
            return (
              <ItemBlockRow
                block={block}
                blocks={blocks ?? []}
                canDemoteToSubLevel={
                  blocks ? hasPreviousLineItem(blocks, block.id) : false
                }
                currency={currency}
                currencySymbol={currencySymbol}
                editingBlockId={editingBlockId}
                hasChildren={hasChildren}
                index={globalIndex}
                isChild={isChild}
                isReadOnly={isReadOnly}
                key={block.id}
                locale={locale}
                offerStatus={offerStatus}
                onAddBlockAbove={onAddBlockAbove}
                onAddGroup={onAddGroup}
                onAddLineItemAbove={onAddLineItemAbove}
                onAddSubItem={onAddSubItem}
                onDeleteBlock={onDeleteBlock}
                onDemoteToSubLevel={onDemoteToSubLevel}
                onDuplicateBlock={onDuplicateBlock}
                onEdit={onEdit}
                onOpenEditModal={
                  isReadOnly ? undefined : setEditingModalBlockId
                }
                onPromoteToTopLevel={onPromoteToTopLevel}
                onSetEditingBlockId={onSetEditingBlockId}
                position={block.content?.position ?? null}
                showTaxPerItem={showTaxPerItem}
                taxRates={taxRates}
                units={units}
              />
            );
          })}
        </TableBody>
        {hasNormalLineItems && (!isReadOnly || showSubtotal) && (
          <TableFooter className="bg-transparent">
            <TableRow className="border-border border-t hover:bg-transparent">
              {!isReadOnly && <TableCell className="w-0 p-0" />}
              <TableCell
                className="py-2 pr-1 pl-0 align-middle"
                colSpan={showTaxPerItem ? 5 : 4}
              >
                <div className="flex items-center justify-between gap-4">
                  {!isReadOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="flex shrink-0 items-center gap-1.5 rounded border border-border px-2 py-1 text-muted-foreground text-xs hover:border-muted-foreground hover:text-foreground"
                          type="button"
                        >
                          <ListPlus className="h-3.5 w-3.5" />
                          {t("offers.addPosition")}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        {footerInsertionSections.map(
                          (section, sectionIndex) => (
                            <div key={section.id}>
                              {footerInsertionSections.length > 1 && (
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
                                return (
                                  <DropdownMenuItem
                                    key={action.id}
                                    onClick={() => {
                                      const lastItem = items.at(-1);
                                      const lastIndex = lastItem
                                        ? (blockIndexMap.get(lastItem.id) ??
                                            items.length - 1) + 1
                                        : 0;
                                      executeInsertionAction({
                                        actionId: action.id,
                                        atIndex: lastIndex,
                                        handlers: {
                                          addBlockAbove: onAddBlockAbove,
                                          addGroup: onAddGroup,
                                          addLineItemAbove: onAddLineItemAbove,
                                        },
                                      });
                                    }}
                                  >
                                    <Icon className="mr-2 h-4 w-4" />
                                    {t(action.labelKey("offer"))}
                                  </DropdownMenuItem>
                                );
                              })}
                              {sectionIndex <
                                footerInsertionSections.length - 1 && (
                                <div className="my-1 h-px bg-border" />
                              )}
                            </div>
                          )
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <span className="ml-auto font-normal text-muted-foreground">
                    {showSubtotal ? t("offers.totals.phaseSubtotal") : ""}
                  </span>
                </div>
              </TableCell>
              <TableCell className="pl-1 text-right font-medium tabular-nums">
                {showSubtotal ? numberFormatter.format(subtotal) : ""}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {editSubtype === "position" && (
        <LineItemEditDialog
          block={editBlock}
          currency={currency}
          locale={locale}
          onOpenChange={handleEditModalOpenChange}
          onSave={handleEditModalSave}
          open={!!editingModalBlockId}
          showPositionField={showPositionField}
          showTaxPerItem={showTaxPerItem}
          taxRates={taxRates}
          units={units}
        />
      )}
      {editSubtype === "headline" && (
        <HeadlineLineItemEditDialog
          block={editBlock}
          onOpenChange={handleEditModalOpenChange}
          onSave={handleEditModalSave}
          open={!!editingModalBlockId}
        />
      )}
      {editSubtype === "text" && (
        <TextLineItemEditDialog
          block={editBlock}
          onOpenChange={handleEditModalOpenChange}
          onSave={handleEditModalSave}
          open={!!editingModalBlockId}
        />
      )}
    </div>
  );
};
