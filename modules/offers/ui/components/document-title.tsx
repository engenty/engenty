import { Input } from "@engenty/ui-core";

interface DocumentTitleProps {
  isReadOnly?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function DocumentTitle({
  value,
  onChange,
  onBlur,
  placeholder = "Title",
  isReadOnly = false,
}: DocumentTitleProps) {
  return (
    <Input
      className={`h-auto w-full rounded-none border-none px-0 py-0 font-medium shadow-none transition-colors md:text-lg lg:text-3xl ${
        isReadOnly
          ? "bg-transparent text-foreground"
          : "bg-input/30 text-foreground hover:bg-input/60 focus-visible:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
      }`}
      disabled={isReadOnly}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
}
