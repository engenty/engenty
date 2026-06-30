import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
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
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  TeamMemberFieldDefinitionInput,
  TeamMemberFieldType,
  TeamMemberFieldVisibility,
} from "../../src/schema/member-field-definitions.js";
import { teamMemberFieldTypeSupportsMultiple } from "../../src/schema/member-field-definitions.js";
import {
  newTeamMemberFieldDefinition,
  parseSelectOptions,
  reorderTeamMemberFieldDefinitions,
  serializeSelectOptions,
  slugFromFieldLabel,
  TEAM_MEMBER_FIELD_TYPES,
} from "../lib/team-member-field-definitions-lib.js";

const GRID_COLS =
  "grid grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_7rem_minmax(0,1.1fr)_2.25rem] gap-x-3 gap-y-2";

export function TeamMemberFieldDefinitionsSectionEditor({
  className,
  definitions,
  onChange,
  visibility,
}: {
  className?: string;
  definitions: TeamMemberFieldDefinitionInput[];
  onChange: (next: TeamMemberFieldDefinitionInput[]) => void;
  visibility: TeamMemberFieldVisibility;
}) {
  const { t } = useTranslation("team");
  const keyTouchedRef = useRef(new Set<string>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    place: "before" | "after";
  } | null>(null);

  const sectionRows = useMemo(
    () =>
      definitions
        .filter((row) => row.visibility === visibility)
        .sort((a, b) => a.sort_order - b.sort_order),
    [definitions, visibility]
  );

  const replaceSectionRows = useCallback(
    (nextSectionRows: TeamMemberFieldDefinitionInput[]) => {
      const other = definitions.filter((row) => row.visibility !== visibility);
      const reindexed = nextSectionRows.map((row, index) => ({
        ...row,
        visibility,
        sort_order: index,
      }));
      onChange([...other, ...reindexed]);
    },
    [definitions, onChange, visibility]
  );

  const addRow = () => {
    replaceSectionRows([
      ...sectionRows,
      newTeamMemberFieldDefinition(visibility, sectionRows.length),
    ]);
  };

  const removeRow = (id: string) => {
    replaceSectionRows(sectionRows.filter((row) => row.id !== id));
    keyTouchedRef.current.delete(id);
  };

  const updateRow = useCallback(
    (id: string, patch: Partial<TeamMemberFieldDefinitionInput>) => {
      replaceSectionRows(
        sectionRows.map((row) => {
          if (row.id !== id) {
            return row;
          }
          const merged = { ...row, ...patch };
          if (patch.label !== undefined && !keyTouchedRef.current.has(id)) {
            merged.field_key = slugFromFieldLabel(patch.label);
          }
          if (
            patch.field_type &&
            !teamMemberFieldTypeSupportsMultiple(patch.field_type)
          ) {
            merged.multiple = false;
          }
          if (patch.field_type && patch.field_type !== "select") {
            merged.options = [];
          }
          return merged;
        })
      );
    },
    [replaceSectionRows, sectionRows]
  );

  const applyReorder = useCallback(
    (sourceId: string, targetId: string, place: "before" | "after") => {
      onChange(
        reorderTeamMemberFieldDefinitions(
          definitions,
          sourceId,
          targetId,
          place
        )
      );
    },
    [definitions, onChange]
  );

  const headerLabels = useMemo(
    () => ({
      label: t("memberFields.col_label"),
      key: t("memberFields.col_key"),
      type: t("memberFields.col_type"),
      options: t("memberFields.col_options"),
    }),
    [t]
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="divide-y divide-border">
        <div className={cn(GRID_COLS, "items-end pb-2")}>
          <div className="flex w-8 shrink-0 justify-center">
            <span className="sr-only">{t("memberFields.drag_handle")}</span>
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
            <span className="sr-only">{t("delete")}</span>
          </div>
        </div>

        {sectionRows.length === 0 ? (
          <p className="py-3 text-muted-foreground text-sm">
            {t("memberFields.empty_section")}
          </p>
        ) : null}

        {sectionRows.map((field) => {
          const showBar =
            dropTarget?.id === field.id &&
            draggingId !== null &&
            draggingId !== field.id;
          return (
            <div
              className={cn(
                "group relative py-1.5 transition-colors",
                "hover:bg-muted/25"
              )}
              key={field.id}
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
                  current?.id === field.id ? null : current
                );
              }}
              onDragOver={(event) => {
                if (!draggingId || draggingId === field.id) {
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
                setDropTarget({ id: field.id, place });
              }}
              onDrop={(event) => {
                if (!draggingId) {
                  return;
                }
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain");
                if (!sourceId || sourceId === field.id) {
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
                applyReorder(sourceId, field.id, place);
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
                  aria-label={t("memberFields.drag_handle")}
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
                    event.dataTransfer.setData("text/plain", field.id);
                    setDraggingId(field.id);
                  }}
                  title={t("memberFields.drag_handle")}
                  type="button"
                  variant="ghost"
                >
                  <GripVertical aria-hidden className="h-4 w-4" />
                </Button>

                <Input
                  className={cn(settingsFieldsEditableInputClass, "min-w-0")}
                  onChange={(event) =>
                    updateRow(field.id, { label: event.target.value })
                  }
                  placeholder={t("memberFields.label_ph")}
                  value={field.label}
                />

                <Input
                  className={cn(
                    settingsFieldsEditableInputClass,
                    "min-w-0 font-mono text-xs"
                  )}
                  onChange={(event) => {
                    keyTouchedRef.current.add(field.id);
                    updateRow(field.id, {
                      field_key: slugFromFieldLabel(event.target.value),
                    });
                  }}
                  placeholder="key"
                  value={field.field_key}
                />

                <Select
                  onValueChange={(value) =>
                    updateRow(field.id, {
                      field_type: value as TeamMemberFieldType,
                    })
                  }
                  value={field.field_type}
                >
                  <SelectTrigger
                    className="h-8 w-full min-w-0 text-xs"
                    size="sm"
                  >
                    <SelectValue>
                      {t(
                        `memberFields.types.${field.field_type}`,
                        field.field_type
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_MEMBER_FIELD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`memberFields.types.${type}`, type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {field.field_type === "select" ? (
                  <Input
                    className={cn(
                      settingsFieldsEditableInputClass,
                      "min-w-0 text-xs"
                    )}
                    onChange={(event) =>
                      updateRow(field.id, {
                        options: parseSelectOptions(event.target.value),
                      })
                    }
                    placeholder={t("memberFields.options_ph")}
                    value={serializeSelectOptions(field.options)}
                  />
                ) : teamMemberFieldTypeSupportsMultiple(field.field_type) ? (
                  <label className="flex h-8 items-center gap-2 text-xs">
                    <Checkbox
                      checked={field.multiple}
                      onCheckedChange={(checked) =>
                        updateRow(field.id, { multiple: checked === true })
                      }
                    />
                    {t("memberFields.multiple")}
                  </label>
                ) : (
                  <div className="min-w-0" />
                )}

                <SettingsFieldsRowEndSlot className="h-8 w-8 justify-self-center">
                  <Button
                    aria-label={t("delete")}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(field.id)}
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
                      updateRow(field.id, {
                        description: event.target.value,
                      })
                    }
                    placeholder={t("memberFields.description_ph")}
                    value={field.description}
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
          {t("memberFields.add_field")}
        </Button>
      </div>
    </div>
  );
}
