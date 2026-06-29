import { Input } from "./input";
import { Label } from "./label";

export interface FieldRowProps {
  desc: string;
  id: string;
  label: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "url";
  value: string;
}

function FieldRow({
  id,
  label,
  desc,
  value,
  onChange,
  type = "text",
}: FieldRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <Label className="font-semibold text-base" htmlFor={id}>
          {label}
        </Label>
        <p className="text-muted-foreground text-sm">{desc}</p>
      </div>
      <Input
        className="max-w-[320px]"
        id={id}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        value={value}
      />
    </div>
  );
}

function FieldRowDivider() {
  return <div className="border-b" />;
}

export { FieldRow, FieldRowDivider };
