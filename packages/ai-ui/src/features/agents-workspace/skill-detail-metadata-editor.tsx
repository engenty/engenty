import { Button, Input, Label } from "@engenty/ui-core";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { SkillMetadataEntry } from "./skill-draft";

interface SkillDetailMetadataEditorProps {
  addRowLabel: string;
  emptyLabel: string;
  entries: SkillMetadataEntry[];
  label: string;
  onAdd: () => void;
  onChange: (
    id: string,
    patch: Partial<Pick<SkillMetadataEntry, "key" | "value">>
  ) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRemove: (id: string) => void;
}

export function SkillDetailMetadataEditor({
  addRowLabel,
  entries,
  emptyLabel,
  label,
  onAdd,
  onChange,
  onMove,
  onRemove,
}: SkillDetailMetadataEditorProps) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <Button onClick={onAdd} size="sm" type="button" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          {addRowLabel}
        </Button>
      </div>
      <div className="grid gap-2">
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        ) : null}
        {entries.map((entry, index) => (
          <div
            className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            key={entry.id}
          >
            <Input
              onChange={(event) =>
                onChange(entry.id, { key: event.target.value })
              }
              placeholder="key"
              value={entry.key}
            />
            <Input
              onChange={(event) =>
                onChange(entry.id, { value: event.target.value })
              }
              placeholder="value"
              value={entry.value}
            />
            <div className="flex items-center gap-1 justify-self-end">
              <Button
                disabled={index === 0}
                onClick={() => onMove(entry.id, "up")}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                disabled={index === entries.length - 1}
                onClick={() => onMove(entry.id, "down")}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => onRemove(entry.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
