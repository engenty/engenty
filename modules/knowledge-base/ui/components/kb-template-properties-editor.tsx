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
} from "@engenty/ui-core";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KbTemplatePropertyDefinition,
  KbTemplatePropertyType,
} from "../../src/schema/types.js";

const TYPES: KbTemplatePropertyType[] = [
  "text",
  "number",
  "date",
  "url",
  "select",
];

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
    .map((option) => option.trim())
    .filter(Boolean);
}

function serializeOptions(options: string[] | undefined): string {
  return (options ?? []).join(", ");
}

export function newTemplateProperty(
  order: number
): KbTemplatePropertyDefinition {
  return {
    id: crypto.randomUUID(),
    key: "",
    label: "",
    description: "",
    order,
    type: "text",
    visible: true,
    show_in_compact: false,
  };
}

function reorderRows(
  list: KbTemplatePropertyDefinition[],
  sourceId: string,
  targetId: string,
  place: "before" | "after"
): KbTemplatePropertyDefinition[] {
  if (sourceId === targetId) {
    return list;
  }
  const from = list.findIndex((row) => row.id === sourceId);
  const to = list.findIndex((row) => row.id === targetId);
  if (from < 0 || to < 0) {
    return list;
  }
  const next = list.filter((row) => row.id !== sourceId);
  const targetIndex = next.findIndex((row) => row.id === targetId);
  if (targetIndex < 0) {
    return list;
  }
  let insertIndex = place === "before" ? targetIndex : targetIndex + 1;
  const adjust = from < insertIndex ? 1 : 0;
  insertIndex -= adjust;
  insertIndex = Math.max(0, Math.min(insertIndex, next.length));
  const source = list[from]!;
  next.splice(insertIndex, 0, source);
  return next.map((row, order) => ({ ...row, order }));
}

export function ensureDraftTemplateProperties(
  definitions: KbTemplatePropertyDefinition[]
): KbTemplatePropertyDefinition[] {
  return definitions.length > 0 ? definitions : [newTemplateProperty(0)];
}

export function normalizeTemplatePropertiesForSave(
  properties: KbTemplatePropertyDefinition[]
): KbTemplatePropertyDefinition[] {
  return properties
    .map((property, order) => ({
      ...property,
      order,
      key: property.key.trim(),
      label: property.label.trim(),
      description: property.description.trim(),
      options:
        property.type === "select"
          ? (property.options ?? [])
              .map((option) => option.trim())
              .filter(Boolean)
          : undefined,
      visible: property.visible !== false,
      show_in_compact: Boolean(property.show_in_compact),
    }))
    .filter((property) => property.key && property.label);
}

const GRID_COLS =
  "grid grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_7rem_minmax(0,1.1fr)_2.25rem] gap-x-3 gap-y-2";

export function KbTemplatePropertiesEditor({
  className,
  properties,
  setProperties,
}: {
  className?: string;
  properties: KbTemplatePropertyDefinition[];
  setProperties: React.Dispatch<
    React.SetStateAction<KbTemplatePropertyDefinition[]>
  >;
}) {
  const { t } = useTranslation("kb");
  const keyTouchedRef = useRef(new Set<string>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    place: "before" | "after";
  } | null>(null);

  useEffect(() => {
    if (properties.length > 0) {
      return;
    }
    setProperties([newTemplateProperty(0)]);
  }, [properties.length, setProperties]);

  const addRow = () => {
    setProperties((prev) => [...prev, newTemplateProperty(prev.length)]);
  };

  const removeRow = (id: string) => {
    setProperties((prev) => {
      const next = prev.filter((property) => property.id !== id);
      return next.length > 0 ? next : [newTemplateProperty(0)];
    });
    keyTouchedRef.current.delete(id);
  };

  const updateRow = useCallback(
    (id: string, patch: Partial<KbTemplatePropertyDefinition>) => {
      setProperties((prev) => {
        const index = prev.findIndex((property) => property.id === id);
        if (index < 0) {
          return prev;
        }
        const next = [...prev];
        const current = next[index]!;
        const merged = { ...current, ...patch };
        if (patch.label !== undefined && !keyTouchedRef.current.has(id)) {
          merged.key = slugFromLabel(patch.label);
        }
        next[index] = merged;
        return next;
      });
    },
    [setProperties]
  );

  const applyReorder = useCallback(
    (sourceId: string, targetId: string, place: "before" | "after") => {
      setProperties((prev) => reorderRows(prev, sourceId, targetId, place));
    },
    [setProperties]
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
    <div className={cn("space-y-2", className)} id="kb-template-properties">
      <div className="divide-y divide-border">
        <div className={cn(GRID_COLS, "items-end pb-2")}>
          <div className="flex w-8 shrink-0 justify-center">
            <span className="sr-only">
              {t("settings.properties.drag_handle")}
            </span>
          </div>
          <span className={settingsFieldsColumnHeaderClass}>
            {headerLabels.label}
          </span>
          <span className={settingsFieldsColumnHeaderClass}>
            {headerLabels.key}
          </span>
          <span className={settingsFieldsColumnHeaderClass}>
            {headerLabels.type}
          </span>
          <span className={settingsFieldsColumnHeaderClass}>
            {headerLabels.options}
          </span>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <span className="sr-only">{t("actions.delete", "Delete")}</span>
          </div>
        </div>

        {properties.map((property) => {
          const showBar =
            dropTarget?.id === property.id &&
            draggingId !== null &&
            draggingId !== property.id;
          return (
            <div
              className={cn(
                "group relative py-1.5 transition-colors",
                "hover:bg-muted/25"
              )}
              key={property.id}
              onDragLeave={(event) => {
                if (!draggingId) {
                  return;
                }
                const next = event.relatedTarget;
                if (
                  next instanceof Node &&
                  event.currentTarget instanceof HTMLElement &&
                  event.currentTarget.contains(next)
                ) {
                  return;
                }
                setDropTarget((current) =>
                  current?.id === property.id ? null : current
                );
              }}
              onDragOver={(event) => {
                if (!draggingId || draggingId === property.id) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = (
                  event.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const place =
                  event.clientY < rect.top + rect.height / 2
                    ? "before"
                    : "after";
                setDropTarget({ id: property.id, place });
              }}
              onDrop={(event) => {
                if (!draggingId) {
                  return;
                }
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain");
                if (!sourceId || sourceId === property.id) {
                  setDraggingId(null);
                  setDropTarget(null);
                  return;
                }
                const rect = (
                  event.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const place =
                  event.clientY < rect.top + rect.height / 2
                    ? "before"
                    : "after";
                applyReorder(sourceId, property.id, place);
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

              <div className={cn(GRID_COLS, "min-h-8 items-start")}>
                <Button
                  aria-label={t("settings.properties.drag_handle")}
                  className="h-8 w-8 shrink-0 cursor-grab touch-none p-0 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  draggable
                  onDragEnd={(event) => {
                    event.stopPropagation();
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", property.id);
                    setDraggingId(property.id);
                  }}
                  title={t("settings.properties.drag_handle")}
                  type="button"
                  variant="ghost"
                >
                  <GripVertical aria-hidden className="h-4 w-4" />
                </Button>

                <Input
                  className={cn(settingsFieldsEditableInputClass, "min-w-0")}
                  onChange={(event) =>
                    updateRow(property.id, { label: event.target.value })
                  }
                  placeholder={t("settings.properties.label_ph")}
                  value={property.label}
                />

                <Input
                  className={cn(
                    settingsFieldsEditableInputClass,
                    "min-w-0 font-mono text-xs"
                  )}
                  onChange={(event) => {
                    keyTouchedRef.current.add(property.id);
                    updateRow(property.id, {
                      key: slugFromLabel(event.target.value),
                    });
                  }}
                  placeholder="key"
                  value={property.key}
                />

                <Select
                  onValueChange={(value) =>
                    updateRow(property.id, {
                      type: value as KbTemplatePropertyType,
                      options:
                        value === "select"
                          ? (property.options ?? [])
                          : undefined,
                    })
                  }
                  value={property.type}
                >
                  <SelectTrigger
                    className="h-8 w-full min-w-0 text-xs"
                    size="sm"
                  >
                    <SelectValue>
                      {t(
                        `settings.properties.types.${property.type}`,
                        property.type
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`settings.properties.types.${type}`, type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {property.type === "select" ? (
                  <Input
                    className={cn(
                      settingsFieldsEditableInputClass,
                      "min-w-0 text-xs"
                    )}
                    onChange={(event) =>
                      updateRow(property.id, {
                        options: parseOptions(event.target.value),
                      })
                    }
                    placeholder={t("settings.properties.options_ph")}
                    value={serializeOptions(property.options)}
                  />
                ) : (
                  <div className="min-w-0" />
                )}

                <SettingsFieldsRowEndSlot className="h-8 w-8 justify-self-center">
                  <Button
                    aria-label={t("templates.remove_property")}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(property.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </SettingsFieldsRowEndSlot>

                <div className="col-span-5 col-start-2 min-w-0">
                  <Input
                    className={cn(
                      settingsFieldsEditableInputClass,
                      "min-w-0 text-xs"
                    )}
                    onChange={(event) =>
                      updateRow(property.id, {
                        description: event.target.value,
                      })
                    }
                    placeholder={t("templates.property_description")}
                    value={property.description}
                  />
                </div>
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
