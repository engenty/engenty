import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { Unit } from "../../types";
import { getUnitOptionLabel } from "../../types";

interface LineItemUnitSelectProps {
  className?: string;
  contentClassName?: string;
  onValueChange: (value: string) => void;
  selectedLabel?: string;
  triggerClassName?: string;
  triggerId?: string;
  units: Unit[];
  value: string;
}

export function LineItemUnitSelect({
  className,
  contentClassName,
  onValueChange,
  selectedLabel,
  triggerClassName,
  triggerId,
  units,
  value,
}: LineItemUnitSelectProps) {
  return (
    <Select onValueChange={onValueChange} value={value}>
      <SelectTrigger className={triggerClassName} id={triggerId}>
        <SelectValue className={className}>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {units
          .filter((unit) => unit.value != null && unit.value.trim() !== "")
          .map((unit) => (
            <SelectItem key={unit.value} value={unit.value}>
              {getUnitOptionLabel(unit)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
