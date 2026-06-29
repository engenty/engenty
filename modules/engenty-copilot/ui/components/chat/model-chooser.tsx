import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";

interface ChatModelChooserProps {
  activeModelId: string;
  ariaLabel: string;
  disabled?: boolean;
  onModelChange: (modelId: string) => void;
  options: Array<{ label: string; value: string }>;
}

export function ChatModelChooser({
  activeModelId,
  ariaLabel,
  disabled,
  onModelChange,
  options,
}: ChatModelChooserProps) {
  return (
    <Select
      disabled={disabled}
      onValueChange={onModelChange}
      value={activeModelId}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-6 max-w-[13rem] rounded-full border-0 bg-transparent px-2 text-muted-foreground text-xs shadow-none hover:bg-muted focus:ring-0 focus:ring-offset-0 data-[placeholder]:text-muted-foreground"
      >
        <SelectValue>
          {options.find((o) => o.value === activeModelId)?.label ??
            activeModelId}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="max-h-72 min-w-72">
        {options.map((option) => (
          <SelectItem
            className="text-xs"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
