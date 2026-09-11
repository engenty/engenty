import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, Input, Textarea } from "@engenty/ui-core";
import { Eye, EyeOff, GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  getCategoryTitleLabel,
  type InboxCategoriesConfig,
  type InboxCategoryItem,
  isFixedInboxCategory,
  normalizeCategorySlug,
} from "../../api/inbox-categories-settings.js";

interface InboxCategoriesSectionProps {
  config: InboxCategoriesConfig;
  onConfigChange: (config: InboxCategoriesConfig) => void;
}

function SortableCategoryRow({
  item,
  titlePlaceholder,
  rulePlaceholder,
  canDelete,
  canEditSlug,
  onToggleVisible,
  onUpdate,
  onDelete,
  onMove,
  autoFocus,
}: {
  item: InboxCategoryItem;
  titlePlaceholder: string;
  rulePlaceholder: string;
  canDelete: boolean;
  canEditSlug: boolean;
  onToggleVisible: (slug: string) => void;
  onUpdate: (slug: string, patch: Partial<InboxCategoryItem>) => void;
  onDelete: (slug: string) => void;
  onMove: (dir: "up" | "down") => void;
  autoFocus?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.slug });
  return (
    <div
      className="group space-y-1.5 border-border-soft border-b py-2 last:border-b-0"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground/50 active:cursor-grabbing group-hover:text-muted-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <Input
          className="h-8 w-32 text-sm"
          disabled={!canEditSlug}
          id={`inbox-cat-slug-${item.slug}`}
          onChange={(event) =>
            onUpdate(item.slug, {
              slug: normalizeCategorySlug(event.target.value),
            })
          }
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && e.shiftKey) {
              e.preventDefault();
              onMove("up");
            } else if (e.key === "ArrowDown" && e.shiftKey) {
              e.preventDefault();
              onMove("down");
            }
          }}
          value={item.slug}
        />
        <Input
          autoFocus={autoFocus}
          className="h-8 min-w-0 flex-1 text-sm"
          id={`inbox-cat-title-${item.slug}`}
          onChange={(event) =>
            onUpdate(item.slug, { title: event.target.value })
          }
          placeholder={titlePlaceholder}
          value={item.title ?? ""}
        />
        <div className="flex h-8 w-24 items-center justify-center">
          <button
            aria-label="Toggle visibility"
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onToggleVisible(item.slug)}
            type="button"
          >
            {item.visible ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="flex h-8 w-7 shrink-0 items-center justify-center">
          {canDelete ? (
            <Button
              aria-label="Delete category"
              className="h-7 w-7"
              onClick={() => onDelete(item.slug)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
      <div className="flex gap-1.5 pl-5">
        <Textarea
          className="min-h-16 flex-1 text-sm"
          id={`inbox-cat-rule-${item.slug}`}
          onChange={(event) =>
            onUpdate(item.slug, { rule: event.target.value })
          }
          placeholder={rulePlaceholder}
          value={item.rule ?? ""}
        />
      </div>
    </div>
  );
}

export function InboxCategoriesSection({
  config,
  onConfigChange,
}: InboxCategoriesSectionProps) {
  const { t } = useTranslation("inbox");
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newRule, setNewRule] = useState("");
  const [newlyAddedSlug, setNewlyAddedSlug] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const sorted = useMemo(
    () => [...config.items].sort((a, b) => a.order - b.order),
    [config.items]
  );

  const toggleVisible = (slug: string) => {
    onConfigChange({
      items: config.items.map((item) =>
        item.slug === slug ? { ...item, visible: !item.visible } : item
      ),
    });
  };

  const updateItem = (slug: string, patch: Partial<InboxCategoryItem>) => {
    const next = config.items.map((item) =>
      item.slug === slug ? { ...item, ...patch } : item
    );
    const seen = new Set<string>();
    const deduped: InboxCategoryItem[] = [];
    for (const item of next) {
      const normalized = normalizeCategorySlug(item.slug);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      deduped.push({ ...item, slug: normalized });
    }
    onConfigChange({ items: deduped });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = sorted.findIndex((item) => item.slug === active.id);
    const newIndex = sorted.findIndex((item) => item.slug === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const next = [...sorted];
    const [moved] = next.splice(oldIndex, 1);
    if (!moved) {
      return;
    }
    next.splice(newIndex, 0, moved);
    onConfigChange({
      items: next.map((item, index) => ({ ...item, order: index })),
    });
  };

  const handleMove = (idx: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) {
      return;
    }
    const next = [...sorted];
    const [moved] = next.splice(idx, 1);
    if (!moved) {
      return;
    }
    next.splice(targetIdx, 0, moved);
    onConfigChange({
      items: next.map((item, index) => ({ ...item, order: index })),
    });
  };

  const removeCategory = (slug: string) => {
    if (isFixedInboxCategory(slug)) {
      return;
    }
    onConfigChange({ items: sorted.filter((item) => item.slug !== slug) });
  };

  const addCategory = () => {
    const slug = normalizeCategorySlug(newSlug);
    if (!slug || sorted.some((item) => item.slug === slug)) {
      return;
    }
    setNewlyAddedSlug(slug);
    onConfigChange({
      items: [
        ...sorted,
        {
          order: sorted.length,
          rule: newRule.trim() || undefined,
          slug,
          title: newTitle.trim() || undefined,
          visible: true,
        },
      ],
    });
    setNewSlug("");
    setNewTitle("");
    setNewRule("");
  };

  return (
    <section className="space-y-1.5">
      <div>
        <h2 className="font-medium text-lg">{t("settings.categoriesTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("settings.categoriesDescription")}
        </p>
      </div>
      <Card className="overflow-hidden">
        <div className="p-4">
          <div className="max-w-3xl space-y-1.5">
            <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
              <div className="w-4" />
              <span className="w-32">{t("settings.categorySlug")}</span>
              <span className="min-w-0 flex-1">
                {t("settings.categoryTitle")}
              </span>
              <span className="w-24 text-center">
                {t("settings.showInMenu")}
              </span>
              <div className="w-7" />
            </div>
            <DndContext
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
              sensors={sensors}
            >
              <SortableContext
                items={sorted.map((item) => item.slug)}
                strategy={verticalListSortingStrategy}
              >
                {sorted.map((item, index) => (
                  <SortableCategoryRow
                    autoFocus={item.slug === newlyAddedSlug}
                    canDelete={!isFixedInboxCategory(item.slug)}
                    canEditSlug={!isFixedInboxCategory(item.slug)}
                    item={item}
                    key={item.slug}
                    onDelete={removeCategory}
                    onMove={(dir) => handleMove(index, dir)}
                    onToggleVisible={toggleVisible}
                    onUpdate={updateItem}
                    rulePlaceholder={t("settings.categoryRule")}
                    titlePlaceholder={getCategoryTitleLabel(
                      item.slug,
                      undefined,
                      t
                    )}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <p className="px-1 text-muted-foreground text-xs">
              {t("settings.categoryRuleHint")}
            </p>
            <div className="flex flex-wrap items-start gap-1.5">
              <div className="w-4 shrink-0" />
              <Input
                className="h-8 w-32 text-sm"
                onChange={(event) =>
                  setNewSlug(normalizeCategorySlug(event.target.value))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder={t("settings.categorySlug")}
                value={newSlug}
              />
              <Input
                className="h-8 min-w-0 flex-1 text-sm"
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder={t("settings.categoryTitle")}
                value={newTitle}
              />
              <Input
                className="h-8 min-w-0 flex-[2] text-sm"
                onChange={(event) => setNewRule(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder={t("settings.categoryRule")}
                value={newRule}
              />
              <Button
                className="h-8 text-xs"
                onClick={addCategory}
                type="button"
                variant="outline"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.addCategory")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
