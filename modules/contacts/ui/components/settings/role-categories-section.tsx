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
import { Button, Card, Input } from "@engenty/ui-core";
import { Eye, EyeOff, GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type ContactsRoleMenuConfig,
  type ContactsRoleMenuItem,
  getRolePluralLabel,
  getRoleTitleLabel,
  isFixedRole,
  normalizeRoleSlug,
} from "../../api/role-menu-settings.js";

interface RoleCategoriesSectionProps {
  config: ContactsRoleMenuConfig;
  onConfigChange: (config: ContactsRoleMenuConfig) => void;
}

function SortableRoleRow({
  item,
  title,
  plural,
  canDelete,
  canEditSlug,
  onToggleVisible,
  onUpdate,
  onDelete,
  onNavigate,
  onMove,
  autoFocus,
}: {
  item: ContactsRoleMenuItem;
  plural: string;
  title: string;
  canDelete: boolean;
  canEditSlug: boolean;
  onToggleVisible: (role: string) => void;
  onUpdate: (slug: string, patch: Partial<ContactsRoleMenuItem>) => void;
  onDelete: (role: string) => void;
  onNavigate: (col: "slug" | "title" | "plural", dir: "up" | "down") => void;
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
      className="group flex items-center gap-1.5 py-0.5"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/50 active:cursor-grabbing group-hover:text-muted-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        className="h-8 w-28 text-sm"
        disabled={!canEditSlug}
        id={`role-slug-input-${item.slug}`}
        onChange={(event) =>
          onUpdate(item.slug, {
            slug: normalizeRoleSlug(event.target.value),
          })
        }
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("up");
            } else {
              onNavigate("slug", "up");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("down");
            } else {
              onNavigate("slug", "down");
            }
          }
        }}
        value={item.slug}
      />
      <Input
        autoFocus={autoFocus}
        className="h-8 min-w-0 flex-1 text-sm"
        id={`role-title-input-${item.slug}`}
        onChange={(event) =>
          onUpdate(item.slug, {
            title: event.target.value,
          })
        }
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("up");
            } else {
              onNavigate("title", "up");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("down");
            } else {
              onNavigate("title", "down");
            }
          }
        }}
        placeholder={title}
        value={item.title ?? ""}
      />
      <Input
        className="h-8 min-w-0 flex-1 text-sm"
        id={`role-plural-input-${item.slug}`}
        onChange={(event) =>
          onUpdate(item.slug, {
            plural: event.target.value,
          })
        }
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("up");
            } else {
              onNavigate("plural", "up");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("down");
            } else {
              onNavigate("plural", "down");
            }
          }
        }}
        placeholder={plural}
        value={item.plural ?? ""}
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
            aria-label="Delete role"
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
  );
}

export function RoleCategoriesSection({
  config,
  onConfigChange,
}: RoleCategoriesSectionProps) {
  const { t } = useTranslation("contacts");
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPlural, setNewPlural] = useState("");
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
    const updated = config.items.map((i) =>
      i.slug === slug ? { ...i, visible: !i.visible } : i
    );
    onConfigChange({ items: updated });
  };

  const updateItem = (slug: string, patch: Partial<ContactsRoleMenuItem>) => {
    const next = config.items.map((item) => {
      if (item.slug !== slug) {
        return item;
      }
      return {
        ...item,
        ...patch,
      };
    });
    const seen = new Set<string>();
    const deduped: ContactsRoleMenuItem[] = [];
    for (const item of next) {
      const normalized = normalizeRoleSlug(item.slug);
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
    next.splice(newIndex, 0, moved);
    onConfigChange({
      items: next.map((item, index) => ({ ...item, order: index })),
    });
  };

  const handleNavigate = (
    idx: number,
    col: "slug" | "title" | "plural",
    dir: "up" | "down"
  ) => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < sorted.length) {
      const target = sorted[targetIdx];
      if (col === "slug") {
        const slugInput = document.getElementById(
          `role-slug-input-${target.slug}`
        ) as HTMLInputElement | null;
        if (slugInput && !slugInput.disabled) {
          slugInput.focus();
          return;
        }
      }
      if (col === "plural") {
        document.getElementById(`role-plural-input-${target.slug}`)?.focus();
        return;
      }
      document.getElementById(`role-title-input-${target.slug}`)?.focus();
    }
  };

  const handleMove = (idx: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < sorted.length) {
      const next = [...sorted];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      onConfigChange({
        items: next.map((item, index) => ({ ...item, order: index })),
      });
    }
  };

  const removeRole = (slug: string) => {
    if (isFixedRole(slug)) {
      return;
    }
    const next = sorted.filter((item) => item.slug !== slug);
    onConfigChange({ items: next });
  };

  const addRole = () => {
    const slug = normalizeRoleSlug(newSlug);
    if (!slug) {
      return;
    }
    if (sorted.some((item) => item.slug === slug)) {
      return;
    }
    setNewlyAddedSlug(slug);
    onConfigChange({
      items: [
        ...sorted,
        {
          slug,
          title: newTitle.trim() || undefined,
          plural: newPlural.trim() || undefined,
          visible: true,
          order: sorted.length,
        },
      ],
    });
    setNewSlug("");
    setNewTitle("");
    setNewPlural("");
  };

  return (
    <section className="space-y-1.5">
      <div>
        <h2 className="font-medium text-lg">{t("roleCategoriesSection")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("roleCategoriesSectionDesc")}
        </p>
      </div>
      <Card className="overflow-hidden">
        <div className="p-4">
          <div className="max-w-2xl space-y-1.5">
            <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
              <div className="w-4" />
              <span className="w-28">{t("roleSlug")}</span>
              <span className="min-w-0 flex-1">{t("roleTitle")}</span>
              <span className="min-w-0 flex-1">{t("rolePlural")}</span>
              <span className="w-24 text-center">{t("showInMenu")}</span>
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
                  <SortableRoleRow
                    autoFocus={item.slug === newlyAddedSlug}
                    canDelete={!isFixedRole(item.slug)}
                    canEditSlug={!isFixedRole(item.slug)}
                    item={item}
                    key={item.slug}
                    onDelete={removeRole}
                    onMove={(dir) => handleMove(index, dir)}
                    onNavigate={(col, dir) => handleNavigate(index, col, dir)}
                    onToggleVisible={toggleVisible}
                    onUpdate={updateItem}
                    plural={getRolePluralLabel(item.slug, t)}
                    title={getRoleTitleLabel(item.slug, t)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <div className="flex items-center gap-1.5">
              <div className="w-4 shrink-0" />
              <Input
                className="h-8 w-28 text-sm"
                onChange={(event) =>
                  setNewSlug(normalizeRoleSlug(event.target.value))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRole();
                  }
                }}
                placeholder={t("roleSlug")}
                value={newSlug}
              />
              <Input
                className="h-8 min-w-0 flex-1 text-sm"
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRole();
                  }
                }}
                placeholder={t("roleTitle")}
                value={newTitle}
              />
              <Input
                className="h-8 min-w-0 flex-1 text-sm"
                onChange={(event) => setNewPlural(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRole();
                  }
                }}
                placeholder={t("rolePlural")}
                value={newPlural}
              />
              <Button
                className="h-8 text-xs"
                onClick={addRole}
                type="button"
                variant="outline"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("addRole")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
