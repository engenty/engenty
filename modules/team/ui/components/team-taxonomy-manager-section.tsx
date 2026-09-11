/**
 * TeamTaxonomyManagerSection — a per-taxonomy card used in the settings page.
 * Supports flat and 2-level hierarchical term lists (parent → child).
 * Built-in taxonomies show terms-only (no delete/rename of the taxonomy itself).
 * Custom taxonomies show a header with label editor + delete button.
 */
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Input, Switch } from "@engenty/ui-core";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { TeamTaxonomy } from "../api.js";

// ---------------------------------------------------------------------------
// Draft types — extend flat draft with hierarchy support
// ---------------------------------------------------------------------------

export interface TaxonomyTermDraftFlat {
  /**
   * Stable local key — persists through object spreads ({...term, label}).
   * Set to `id` for persisted terms, or a fresh `crypto.randomUUID()` for new ones.
   * Used for parent→child matching and dnd-kit sortable IDs.
   */
  _key: string;
  /** Persisted UUID — omitted for new terms. */
  id?: string;
  label: string;
  /** Parent term UUID (only used when taxonomy.supports_hierarchy = true). */
  parent_term_id?: string | null;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Unified sortable row — used for both top-level and child items
// ---------------------------------------------------------------------------

interface SortableTermRowProps {
  autoFocus?: boolean;
  extraCell?: React.ReactNode;
  isChild?: boolean;
  onAddChild?: () => void;
  onEnter: () => void;
  onLabelChange: (label: string) => void;
  onMove: (dir: "up" | "down") => void; // Shift + Arrow up/down
  onNavigate: (dir: "up" | "down") => void; // Arrow up/down
  onNest?: () => void; // Tab: make this top-level item a child of the one above
  onRemove: () => void;
  onUnnest?: () => void; // Shift+Tab: promote this child to top-level
  sortableId: string;
  supportsHierarchy?: boolean;
  term: TaxonomyTermDraftFlat;
}

function SortableTermRow({
  term,
  sortableId,
  isChild = false,
  onLabelChange,
  onRemove,
  onAddChild,
  onEnter,
  onNest,
  onUnnest,
  onNavigate,
  onMove,
  supportsHierarchy = false,
  extraCell,
  autoFocus,
}: SortableTermRowProps) {
  const { t } = useTranslation("team");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        isChild && "mt-1 pl-8",
        isDragging && "z-50"
      )}
      ref={setNodeRef}
      style={style}
    >
      {/* depth indicator for children */}
      {isChild && (
        <span className="mr-0.5 select-none text-muted-foreground/40 text-xs">
          └
        </span>
      )}

      {/* drag handle */}
      <button
        aria-label={t("settings.drag_to_reorder")}
        className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Input
        autoFocus={autoFocus}
        className="h-8 min-w-0 flex-1 text-sm"
        id={`term-input-${term._key}`}
        onChange={(e) => onLabelChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("up");
            } else {
              onNavigate("up");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("down");
            } else {
              onNavigate("down");
            }
          } else if (e.key === "Tab" && !e.shiftKey && onNest) {
            e.preventDefault();
            onNest();
          } else if (e.key === "Tab" && e.shiftKey && onUnnest) {
            e.preventDefault();
            onUnnest();
          }
        }}
        placeholder={t("settings.term_name")}
        value={term.label}
      />

      {extraCell}

      {/* add child button — top-level items only in hierarchy mode */}
      {supportsHierarchy && !isChild && onAddChild && (
        <Button
          aria-label={t("settings.addSubTerm")}
          className="h-7 w-7 shrink-0"
          onClick={onAddChild}
          size="icon"
          title={t("settings.addSubTerm")}
          type="button"
          variant="ghost"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}

      <Button
        aria-label={t("settings.remove_term")}
        className="h-7 w-7 shrink-0"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TermList — manages the flat draft array and renders it via DnD
// ---------------------------------------------------------------------------

interface TermListProps {
  onTermsChange: (terms: TaxonomyTermDraftFlat[]) => void;
  supportsHierarchy: boolean;
  terms: TaxonomyTermDraftFlat[];
}

function TermList({ terms, onTermsChange, supportsHierarchy }: TermListProps) {
  const { t } = useTranslation("team");
  const [newlyAddedKey, setNewlyAddedKey] = useState<string | null>(null);

  const nextKey = () => crypto.randomUUID();

  // Helpers ----------------------------------------------------------------

  const topLevel = supportsHierarchy
    ? terms.filter((t) => !t.parent_term_id)
    : terms;

  const childrenOf = (parentKey: string) =>
    supportsHierarchy
      ? terms.filter((t) => t.parent_term_id === parentKey)
      : [];

  const parentOf = (term: TaxonomyTermDraftFlat) =>
    term.parent_term_id
      ? (terms.find((t) => t._key === term.parent_term_id) ?? null)
      : null;

  // Flat key order matches DOM render order: parent, children…, next parent…
  const sortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const p of topLevel) {
      ids.push(p._key);
      for (const c of childrenOf(p._key)) {
        ids.push(c._key);
      }
    }
    return ids;
  }, [terms]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Mutations --------------------------------------------------------------

  const updateLabel = (term: TaxonomyTermDraftFlat, label: string) => {
    const idx = terms.indexOf(term);
    if (idx < 0) {
      return;
    }
    const updated = [...terms];
    updated[idx] = { ...updated[idx], label };
    onTermsChange(updated);
  };

  const removeTerm = (term: TaxonomyTermDraftFlat) => {
    const key = term._key;
    onTermsChange(terms.filter((t) => t !== term && t.parent_term_id !== key));
  };

  const addChild = (parentTerm: TaxonomyTermDraftFlat) => {
    const key = nextKey();
    setNewlyAddedKey(key);
    onTermsChange([
      ...terms,
      {
        label: "",
        sort_order: terms.length,
        parent_term_id: parentTerm._key,
        _key: key,
      },
    ]);
  };

  const addTopLevel = () => {
    const key = nextKey();
    setNewlyAddedKey(key);
    onTermsChange([
      ...terms,
      { label: "", sort_order: terms.length, _key: key },
    ]);
  };

  const insertTermBelow = (currentTerm: TaxonomyTermDraftFlat) => {
    const key = nextKey();
    setNewlyAddedKey(key);

    const isChild = !!currentTerm.parent_term_id;
    const newTerm: TaxonomyTermDraftFlat = {
      label: "",
      sort_order: terms.length,
      _key: key,
      parent_term_id: currentTerm.parent_term_id || null,
    };

    if (isChild) {
      const idx = terms.findIndex((t) => t._key === currentTerm._key);
      if (idx >= 0) {
        const updated = [...terms];
        updated.splice(idx + 1, 0, newTerm);
        onTermsChange(updated);
      }
    } else {
      const children = childrenOf(currentTerm._key);
      const lastItemToSkip = children.at(-1) ?? currentTerm;
      const idx = terms.findIndex((t) => t._key === lastItemToSkip._key);
      if (idx >= 0) {
        const updated = [...terms];
        updated.splice(idx + 1, 0, newTerm);
        onTermsChange(updated);
      }
    }
  };

  /**
   * Tab: make a top-level term a child of the nearest preceding top-level item.
   * No-op if this is already the first top-level item.
   */
  const nestTerm = (term: TaxonomyTermDraftFlat) => {
    const idx = terms.indexOf(term);
    for (let i = idx - 1; i >= 0; i--) {
      if (!terms[i].parent_term_id) {
        const updated = [...terms];
        updated[idx] = { ...updated[idx], parent_term_id: terms[i]._key };
        onTermsChange(updated);
        return;
      }
    }
  };

  /**
   * Shift+Tab: promote a child term to top-level.
   */
  const unnestTerm = (term: TaxonomyTermDraftFlat) => {
    const idx = terms.indexOf(term);
    if (idx < 0) {
      return;
    }
    const updated = [...terms];
    updated[idx] = { ...updated[idx], parent_term_id: null };
    onTermsChange(updated);
  };

  // Reordering & Keyboard Navigation ---------------------------------------

  const performReorder = (activeId: string, overId: string) => {
    const activeItem = terms.find((t) => t._key === activeId);
    if (!activeItem) {
      return;
    }

    if (!supportsHierarchy) {
      // Flat list: simple reorder
      const ids = terms.map((t) => t._key);
      const oldIdx = ids.indexOf(activeId);
      const newIdx = ids.indexOf(overId);
      if (oldIdx < 0 || newIdx < 0) {
        return;
      }
      onTermsChange(arrayMove([...terms], oldIdx, newIdx));
      return;
    }

    if (!activeItem.parent_term_id) {
      // ── Dragging a TOP-LEVEL item ──────────────────────────────────────
      // Move the entire group (parent + its children) as a unit.
      // The "over" target determines the destination group slot.
      const overItem = terms.find((t) => t._key === overId);
      if (!overItem) {
        return;
      }

      // Find the top-level item that owns the drop target
      const overTopLevelKey = overItem.parent_term_id ?? overItem._key;
      if (overTopLevelKey === activeItem._key) {
        return;
      }

      const oldGroupIdx = topLevel.findIndex((t) => t._key === activeItem._key);
      const newGroupIdx = topLevel.findIndex((t) => t._key === overTopLevelKey);
      if (oldGroupIdx < 0 || newGroupIdx < 0) {
        return;
      }

      const newTopLevel = arrayMove(topLevel, oldGroupIdx, newGroupIdx);
      const result: TaxonomyTermDraftFlat[] = [];
      for (const p of newTopLevel) {
        result.push(p);
        result.push(...childrenOf(p._key));
      }
      onTermsChange(result);
      return;
    }

    // ── Dragging a CHILD item ──────────────────────────────────────────
    // Reorder within the flat list, then reassign parent based on the nearest
    // preceding top-level item in the new order. Dragging above all top-level
    // items promotes the child to top-level (parent_term_id = null).
    const flatIds = sortableIds;
    const oldIdx = flatIds.indexOf(activeId);
    const newIdx = flatIds.indexOf(overId);
    if (oldIdx < 0 || newIdx < 0) {
      return;
    }

    // Rebuild flat array in group order, then reorder within it
    const orderedTerms = sortableIds.map(
      (key) => terms.find((t) => t._key === key)!
    );
    const reordered = arrayMove(orderedTerms, oldIdx, newIdx);

    // Find new parent: nearest top-level item before the dropped child
    const droppedIdx = reordered.findIndex((t) => t._key === activeItem._key);
    let newParentKey: string | null = null;
    for (let i = droppedIdx - 1; i >= 0; i--) {
      if (!reordered[i].parent_term_id) {
        newParentKey = reordered[i]._key;
        break;
      }
    }

    onTermsChange(
      reordered.map((item) =>
        item._key === activeItem._key
          ? { ...item, parent_term_id: newParentKey }
          : item
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    performReorder(active.id as string, over.id as string);
  };

  const handleNavigate = (key: string, dir: "up" | "down") => {
    const idx = sortableIds.indexOf(key);
    if (idx < 0) {
      return;
    }
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < sortableIds.length) {
      const targetKey = sortableIds[targetIdx];
      document.getElementById(`term-input-${targetKey}`)?.focus();
    }
  };

  const handleMove = (key: string, dir: "up" | "down") => {
    const item = terms.find((t) => t._key === key);
    if (!item) {
      return;
    }

    const isChild = !!item.parent_term_id;
    if (!isChild && supportsHierarchy) {
      const idx = topLevel.findIndex((t) => t._key === key);
      if (idx < 0) {
        return;
      }
      const targetIdx = dir === "up" ? idx - 1 : idx + 1;
      if (targetIdx >= 0 && targetIdx < topLevel.length) {
        const targetParent = topLevel[targetIdx];
        performReorder(key, targetParent._key);
      }
    } else {
      const idx = sortableIds.indexOf(key);
      if (idx < 0) {
        return;
      }
      const targetIdx = dir === "up" ? idx - 1 : idx + 1;
      if (targetIdx >= 0 && targetIdx < sortableIds.length) {
        const targetKey = sortableIds[targetIdx];
        performReorder(key, targetKey);
      }
    }
  };

  // Render -----------------------------------------------------------------

  return (
    <div className="space-y-1.5">
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
        <div className="w-7 shrink-0" />
        <span className="min-w-0 flex-1">{t("settings.term_name")}</span>
        {supportsHierarchy && <div className="w-7 shrink-0" />}
        <div className="w-7 shrink-0" />
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {topLevel.map((parent) => {
            const children = childrenOf(parent._key);
            return (
              <div className="mb-1.5" key={parent._key}>
                <SortableTermRow
                  autoFocus={parent._key === newlyAddedKey}
                  isChild={false}
                  onAddChild={
                    supportsHierarchy ? () => addChild(parent) : undefined
                  }
                  onEnter={() => insertTermBelow(parent)}
                  onLabelChange={(label) => updateLabel(parent, label)}
                  onMove={(dir) => handleMove(parent._key, dir)}
                  onNavigate={(dir) => handleNavigate(parent._key, dir)}
                  onNest={
                    supportsHierarchy ? () => nestTerm(parent) : undefined
                  }
                  onRemove={() => removeTerm(parent)}
                  sortableId={parent._key}
                  supportsHierarchy={supportsHierarchy}
                  term={parent}
                />
                {children.map((child) => (
                  <SortableTermRow
                    autoFocus={child._key === newlyAddedKey}
                    isChild
                    key={child._key}
                    onEnter={() => insertTermBelow(child)}
                    onLabelChange={(label) => updateLabel(child, label)}
                    onMove={(dir) => handleMove(child._key, dir)}
                    onNavigate={(dir) => handleNavigate(child._key, dir)}
                    onRemove={() => removeTerm(child)}
                    onUnnest={() => unnestTerm(child)}
                    sortableId={child._key}
                    term={child}
                  />
                ))}
              </div>
            );
          })}
        </SortableContext>
      </DndContext>

      <Button
        className="h-7 text-xs"
        onClick={addTopLevel}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t("settings.add_term")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section card
// ---------------------------------------------------------------------------

interface TeamTaxonomyManagerSectionProps {
  onDelete?: () => void;
  onLabelChange?: (label: string) => void;
  onPluralLabelChange?: (plural: string) => void;
  onSupportsHierarchyChange?: (val: boolean) => void;
  onTermsChange: (terms: TaxonomyTermDraftFlat[]) => void;
  taxonomy: TeamTaxonomy;
  terms: TaxonomyTermDraftFlat[];
}

export function TeamTaxonomyManagerSection({
  taxonomy,
  terms,
  onTermsChange,
  onDelete,
  onLabelChange,
  onPluralLabelChange,
  onSupportsHierarchyChange,
}: TeamTaxonomyManagerSectionProps) {
  const { t } = useTranslation("team");
  const [collapsed, setCollapsed] = useState(false);
  const pluralLabel = (taxonomy.config.plural_label as string) ?? "";
  const isCustom = !taxonomy.builtin;

  return (
    <div className="ui-card-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("settings.expand") : t("settings.collapse")}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed((v) => !v)}
          type="button"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {isCustom && onLabelChange ? (
          <Input
            className="h-7 flex-1 font-semibold text-sm"
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder={t("settings.taxonomyName")}
            value={taxonomy.label}
          />
        ) : (
          <span className="flex-1 font-semibold text-sm">{taxonomy.label}</span>
        )}

        {/* Plural label — only for custom */}
        {isCustom && onPluralLabelChange && (
          <Input
            className="h-7 w-32 text-sm"
            onChange={(e) => onPluralLabelChange(e.target.value)}
            placeholder={t("settings.taxonomyPlural")}
            value={pluralLabel}
          />
        )}

        {/* Hierarchical toggle — only for custom */}
        {isCustom && onSupportsHierarchyChange && (
          <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Switch
              checked={taxonomy.supports_hierarchy}
              onCheckedChange={onSupportsHierarchyChange}
            />
            {t("settings.taxonomyHierarchical")}
          </label>
        )}

        {/* Delete — only for custom, deletable */}
        {isCustom && taxonomy.deletable && onDelete && (
          <Button
            aria-label={t("settings.deleteTaxonomy")}
            className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive"
            onClick={onDelete}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Term list */}
      {!collapsed && (
        <div className="p-4">
          <TermList
            onTermsChange={onTermsChange}
            supportsHierarchy={taxonomy.supports_hierarchy}
            terms={terms}
          />
        </div>
      )}
    </div>
  );
}
