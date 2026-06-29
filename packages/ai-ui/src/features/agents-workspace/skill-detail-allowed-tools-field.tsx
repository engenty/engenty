import { Button, Input, Label, MultiSelect } from "@engenty/ui-core";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

interface SkillDetailAllowedToolsFieldProps {
  addCustomLabel: string;
  customPlaceholder: string;
  hint: string;
  label: string;
  onChange: (next: string[]) => void;
  options: string[];
  selectPlaceholder: string;
  value: string[];
}

export function SkillDetailAllowedToolsField({
  addCustomLabel,
  customPlaceholder,
  hint,
  label,
  onChange,
  options,
  selectPlaceholder,
  value,
}: SkillDetailAllowedToolsFieldProps) {
  const [customToolId, setCustomToolId] = useState("");
  const selectOptions = useMemo(
    () =>
      options.map((option) => ({
        label: option,
        value: option,
      })),
    [options]
  );

  return (
    <div className="grid gap-3">
      <Label>{label}</Label>
      <MultiSelect
        defaultValue={value}
        hideSelectAll
        onValueChange={onChange}
        options={selectOptions}
        placeholder={selectPlaceholder}
        resetOnDefaultValueChange
        searchable
        showClear
      />
      <div className="flex gap-2">
        <Input
          onChange={(event) => setCustomToolId(event.target.value)}
          placeholder={customPlaceholder}
          value={customToolId}
        />
        <Button
          onClick={() => {
            const next = customToolId.trim();
            if (!next || value.includes(next)) {
              return;
            }
            onChange([...value, next]);
            setCustomToolId("");
          }}
          type="button"
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          {addCustomLabel}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
