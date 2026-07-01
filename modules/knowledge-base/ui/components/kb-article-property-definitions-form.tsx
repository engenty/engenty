/**
 * Edit article property definitions for a single knowledge base
 * (scoped KB settings — table grid, drag reorder, visibility / compact flags).
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFieldsRowEndSlot,
  settingsFieldsColumnHeaderClass,
  settingsFieldsEditableInputClass,
  settingsFieldsLockedInputClass,
} from "@engenty/ui-core";
import {
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { articlePropertyDefinitionsSchema } from "../../src/schema/knowledge-bases.js";
import type {
  ArticlePropertyDefinition,
  ArticlePropertyDefinitionType,
} from "../../src/schema/types.js";

const TYPES: ArticlePropertyDefinitionType[] = [
  "text",
  "number",
  "date",
  "url",
  "select",
];

const BUILTIN_LABEL_KEYS: Record<string, string> = {
  created_at: "settings.properties.builtin.created_at",
  created_by: "settings.properties.builtin.created_by",
  updated_at: "settings.properties.builtin.updated_at",
  status: "settings.properties.builtin.status",
  tags: "settings.properties.builtin.tags",
  category_id: "settings_properties_builtin_category",
  parent_article_id: "settings_properties_builtin_parent",
};

function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function parseOptions(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeOptions(opts: string[] | undefined): string {
  return (opts ?? []).join(", ");
}

function reorderRows(
  list: ArticlePropertyDefinition[],
  sourceId: string,
  targetId: string,
  place: "before" | "after"
): ArticlePropertyDefinition[] {
  if (sourceId === targetId) {
    return list;
  }
  const from = list.findIndex((r) => r.id === sourceId);
  const to = list.findIndex((r) => r.id === targetId);
  if (from < 0 || to < 0) {
    return list;
  }
  const next = list.filter((r) => r.id !== sourceId);
  const tIdx = next.findIndex((r) => r.id === targetId);
  if (tIdx < 0) {
    return list;
  }
  let insertIdx = place === "before" ? tIdx : tIdx + 1;
  const adjust = from < insertIdx ? 1 : 0;
  insertIdx -= adjust;
  insertIdx = Math.max(0, Math.min(insertIdx, next.length));
  const source = list[from]!;
  next.splice(insertIdx, 0, source);
  return next.map((r, i) => ({ ...r, order: i }));
}

/** Normalize + validate definitions for PUT `article_property_definitions` (shared with page save). */
export function normalizeKbArticlePropertyDefinitionsForSave(
  rows: ArticlePropertyDefinition[]
):
  | { ok: true; data: ArticlePropertyDefinition[] }
  | { ok: false; message: string } {
  const normalized = rows
    .map((r, i) => ({
      ...r,
      order: i,
      key: r.builtin_ref ? r.builtin_ref : r.key.trim(),
      label: r.builtin_ref ? (r.label?.trim() ?? "") : r.label.trim(),
      options: r.builtin_ref || r.type !== "select" ? undefined : r.options,
      visible: r.visible !== false,
      show_in_compact: Boolean(r.show_in_compact),
    }))
    .filter(
      (r) => r.builtin_ref || (r.key.length > 0 && r.label.trim().length > 0)
    );

  const parsed = articlePropertyDefinitionsSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid properties",
    };
  }
  return { ok: true, data: parsed.data };
}

/** One surface inside SettingsFormSection — no nested Card/border. */
const GRID_COLS =
  "grid grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_7rem_minmax(0,1.1fr)_2.25rem_2.25rem_2.25rem] gap-x-3 gap-y-1";

export function KbArticlePropertyDefinitionsForm({
  definitions,
  onDefinitionsChange,
}: {
  definitions: ArticlePropertyDefinition[];
  onDefinitionsChange: React.Dispatch<
    React.SetStateAction<ArticlePropertyDefinition[]>
  >;
}) {
  const { t } = useTranslation("kb");
  const keyTouchedRef = useRef(new Set<string>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    place: "before" | "after";
  } | null>(null);

  const rows = definitions;

  const addRow = () => {
    const id = crypto.randomUUID();
    onDefinitionsChange((prev) => [
      ...prev,
      {
        id,
        key: "",
        label: "",
        type: "text",
        order: prev.length,
        options: [],
        visible: true,
        show_in_compact: false,
      },
    ]);
  };

  const removeRow = (id: string) => {
    onDefinitionsChange((prev) => prev.filter((r) => r.id !== id));
    keyTouchedRef.current.delete(id);
  };

  const updateRow = useCallback(
    (id: string, patch: Partial<ArticlePropertyDefinition>) => {
      onDefinitionsChange((prev) => {
        const idx = prev.findIndex((r) => r.id === id);
        if (idx < 0) {
          return prev;
        }
        const next = [...prev];
        const cur = next[idx]!;
        const merged = { ...cur, ...patch };
        if (
          patch.label !== undefined &&
          !keyTouchedRef.current.has(cur.id) &&
          !cur.builtin_ref
        ) {
          merged.key = slugFromLabel(patch.label);
        }
        next[idx] = merged;
        return next;
      });
    },
    [onDefinitionsChange]
  );

  const onKeyManual = (id: string) => {
    keyTouchedRef.current.add(id);
  };

  const applyReorder = useCallback(
    (sourceId: string, targetId: string, place: "before" | "after") => {
      onDefinitionsChange((prev) =>
        reorderRows(prev, sourceId, targetId, place)
      );
    },
    [onDefinitionsChange]
  );

  const headerLabels = useMemo(
    () => ({
      label: t("settings.properties.col_label"),
      key: t("settings.properties.col_key"),
      type: t("settings.properties.col_type"),
      options: t("settings.properties.col_options"),
    }),
    [t]
  );

  return (
    <div className="space-y-3" id="kb-article-properties">
      <div className="divide-y divide-border">
        <div className={cn(GRID_COLS, "items-end py-2")}>
          {/* Match drag-handle column width; sr-only would not reserve grid space. */}
          <div className="flex w-8 shrink-0 justify-center">
            <span className="sr-only">
              {t("settings.properties.drag_handle")}
            </span>
          </div>
          <span className={cn(settingsFieldsColumnHeaderClass)}>
            {headerLabels.label}
          </span>
          <span className={cn(settingsFieldsColumnHeaderClass)}>
            {headerLabels.key}
          </span>
          <span className={cn(settingsFieldsColumnHeaderClass)}>
            {headerLabels.type}
          </span>
          <span className={cn(settingsFieldsColumnHeaderClass)}>
            {headerLabels.options}
          </span>
          <span className={cn(settingsFieldsColumnHeaderClass, "text-center")}>
            {t("settings.properties.col_visible")}
          </span>
          <span className={cn(settingsFieldsColumnHeaderClass, "text-center")}>
            {t("settings.properties.col_compact")}
          </span>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <span className="sr-only">{t("settings.properties.col_lock")}</span>
          </div>
        </div>

        {rows.map((row) => {
          const locked = Boolean(row.builtin_ref);
          const showBar =
            dropTarget?.id === row.id &&
            draggingId !== null &&
            draggingId !== row.id;
          return (
            <div
              className={cn(
                "group relative py-1.5 transition-colors",
                "hover:bg-muted/25"
              )}
              key={row.id}
              onDragLeave={(e) => {
                if (!draggingId) {
                  return;
                }
                const next = e.relatedTarget;
                if (
                  next instanceof Node &&
                  e.currentTarget instanceof HTMLElement &&
                  e.currentTarget.contains(next)
                ) {
                  return;
                }
                setDropTarget((cur) => (cur?.id === row.id ? null : cur));
              }}
              onDragOver={(e) => {
                if (!draggingId || draggingId === row.id) {
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const place =
                  e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                setDropTarget({ id: row.id, place });
              }}
              onDrop={(e) => {
                if (!draggingId) {
                  return;
                }
                e.preventDefault();
                const sourceId = e.dataTransfer.getData("text/plain");
                if (!sourceId || sourceId === row.id) {
                  setDraggingId(null);
                  setDropTarget(null);
                  return;
                }
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const place =
                  e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                applyReorder(sourceId, row.id, place);
                setDraggingId(null);
                setDropTarget(null);
              }}
            >
              {showBar && dropTarget ? (
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute right-2 left-2 z-10 h-0.5 rounded-full bg-primary ring-2 ring-background",
                    dropTarget.place === "before" ? "top-0" : "bottom-0"
                  )}
                />
              ) : null}

              <div className={cn(GRID_COLS, "min-h-8 items-center")}>
                <Button
                  aria-label={t("settings.properties.drag_handle")}
                  className="h-8 w-8 shrink-0 cursor-grab touch-none p-0 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  draggable
                  onDragEnd={(ev) => {
                    ev.stopPropagation();
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  onDragStart={(ev) => {
                    ev.stopPropagation();
                    ev.dataTransfer.effectAllowed = "move";
                    ev.dataTransfer.setData("text/plain", row.id);
                    setDraggingId(row.id);
                  }}
                  title={t("settings.properties.drag_handle")}
                  type="button"
                  variant="ghost"
                >
                  <GripVertical aria-hidden className="h-4 w-4" />
                </Button>

                {locked ? (
                  <Input
                    className={cn(
                      settingsFieldsLockedInputClass,
                      "min-w-0 truncate"
                    )}
                    disabled
                    title={t(
                      BUILTIN_LABEL_KEYS[row.builtin_ref!] ?? row.key,
                      row.key
                    )}
                    value={t(
                      BUILTIN_LABEL_KEYS[row.builtin_ref!] ?? row.key,
                      row.key
                    )}
                  />
                ) : (
                  <Input
                    className={cn(settingsFieldsEditableInputClass, "min-w-0")}
                    onChange={(e) =>
                      updateRow(row.id, { label: e.target.value })
                    }
                    placeholder={t("settings.properties.label_ph")}
                    value={row.label}
                  />
                )}

                {locked ? (
                  <Input
                    className={cn(
                      settingsFieldsLockedInputClass,
                      "min-w-0 font-mono text-xs"
                    )}
                    disabled
                    title={row.key}
                    value={row.key}
                  />
                ) : (
                  <Input
                    className={cn(
                      settingsFieldsEditableInputClass,
                      "min-w-0 font-mono text-xs"
                    )}
                    onChange={(e) => {
                      onKeyManual(row.id);
                      updateRow(row.id, { key: e.target.value });
                    }}
                    placeholder="key"
                    value={row.key}
                  />
                )}

                {locked ? (
                  <Input
                    className={cn(settingsFieldsLockedInputClass, "min-w-0")}
                    disabled
                    value="—"
                  />
                ) : (
                  <Select
                    onValueChange={(v) =>
                      updateRow(row.id, {
                        type: v as ArticlePropertyDefinitionType,
                        options: v === "select" ? row.options : undefined,
                      })
                    }
                    value={row.type}
                  >
                    <SelectTrigger
                      className="h-8 w-full min-w-0 text-xs"
                      size="sm"
                    >
                      <SelectValue>
                        {t(`settings.properties.types.${row.type}`, row.type)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((tp) => (
                        <SelectItem key={tp} value={tp}>
                          {t(`settings.properties.types.${tp}`, tp)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {locked ? (
                  <Input
                    className={cn(settingsFieldsLockedInputClass, "min-w-0")}
                    disabled
                    value="—"
                  />
                ) : row.type === "select" ? (
                  <Input
                    className={cn(
                      settingsFieldsEditableInputClass,
                      "min-w-0 text-xs"
                    )}
                    onChange={(e) =>
                      updateRow(row.id, {
                        options: parseOptions(e.target.value),
                      })
                    }
                    placeholder={t("settings.properties.options_ph")}
                    value={serializeOptions(row.options)}
                  />
                ) : (
                  <div className="min-w-0" />
                )}

                <div className="flex justify-center">
                  <Button
                    aria-label={
                      row.visible === false
                        ? t("settings.properties.show_field")
                        : t("settings.properties.hide_field")
                    }
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      updateRow(row.id, {
                        visible: !(row.visible !== false),
                      })
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {row.visible === false ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="flex justify-center">
                  <Button
                    aria-label={
                      row.show_in_compact
                        ? t("settings.properties.unpin_compact")
                        : t("settings.properties.pin_compact")
                    }
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      updateRow(row.id, {
                        show_in_compact: !row.show_in_compact,
                      })
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {row.show_in_compact ? (
                      <Pin className="h-4 w-4 text-primary" />
                    ) : (
                      <PinOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <SettingsFieldsRowEndSlot className="h-8 w-8 justify-self-center">
                  {locked ? (
                    <Lock
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                    />
                  ) : (
                    <Button
                      aria-label={t("settings.properties.remove")}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </SettingsFieldsRowEndSlot>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-8 text-xs"
          onClick={addRow}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("settings.properties.add")}
        </Button>
      </div>
    </div>
  );
}
