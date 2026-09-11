import { Input } from "@engenty/ui-core";

interface DocumentTitleInputProps {
  disabled?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function DocumentTitleInput({
  value,
  onChange,
  onBlur,
  placeholder = "Title",
  disabled = false,
}: DocumentTitleInputProps) {
  return (
    <Input
      className={`h-auto w-full rounded-none border-0 px-0 py-0 font-semibold text-xl shadow-none transition-colors md:text-2xl ${
        disabled
          ? "bg-transparent text-foreground"
          : "bg-transparent text-foreground hover:bg-input/25 focus-visible:bg-input/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
      }`}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
}
