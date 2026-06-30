import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Save } from "lucide-react";

interface PresetSelectorProps {
  noPresetLabel: string;
  onSaveClick: () => void;
  onSelectPreset: (name: string | null) => void;
  presets: Array<{ name: string }>;
  selectedPreset?: string;
}

export function PresetSelector({
  presets,
  selectedPreset,
  onSelectPreset,
  onSaveClick,
  noPresetLabel,
}: PresetSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Select
        onValueChange={(value) =>
          onSelectPreset(value === "__none__" ? null : value)
        }
        value={selectedPreset || "__none__"}
      >
        <SelectTrigger className="h-9 w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">{noPresetLabel}</span>
          </SelectItem>
          {presets.map((preset) => (
            <SelectItem key={preset.name} value={preset.name}>
              {preset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        className="h-9 w-9 shrink-0"
        onClick={onSaveClick}
        size="icon"
        variant="outline"
      >
        <Save className="h-4 w-4" />
      </Button>
    </div>
  );
}
