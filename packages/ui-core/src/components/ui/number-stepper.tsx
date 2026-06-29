import { Minus, Plus } from "lucide-react";
import type * as React from "react";
import { formFieldRadiusClassName } from "../../lib/form-field-chrome";
import { cn } from "../../utils";
import { Button } from "./button";
import { Input } from "./input";

export type NumberStepperProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: number;
  onChange: (value: number) => void;
  allowEmpty?: boolean;
  inputValue?: string;
  onInputValueChange?: (value: string) => void;
  step?: number;
  stepLarge?: number;
  showButtons?: boolean;
  inputClassName?: string;
};

export function NumberStepper({
  value,
  onChange,
  allowEmpty = false,
  inputValue,
  onInputValueChange,
  step = 1,
  stepLarge = 10,
  showButtons = true,
  className,
  inputClassName,
  min,
  max,
  onBlur,
  onKeyDown,
  ...rest
}: NumberStepperProps) {
  const clamp = (next: number) => {
    let clamped = next;
    if (typeof min === "number") {
      clamped = Math.max(clamped, min);
    }
    if (typeof max === "number") {
      clamped = Math.min(clamped, max);
    }
    return clamped;
  };

  const applyDelta = (delta: number) =>
    onChange(clamp((Number(value) || 0) + delta));

  const renderedValue =
    inputValue ?? (Number.isFinite(value) ? String(value) : "");

  return (
    <div
      className={cn(
        "flex items-center gap-1 border border-input bg-card px-1 transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/45 focus-within:ring-offset-0",
        formFieldRadiusClassName,
        className
      )}
    >
      {showButtons ? (
        <Button
          className="h-8 w-8 shrink-0"
          onClick={() => applyDelta(-step)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <Input
        className={cn(
          "border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 [appearance:textfield]",
          inputClassName
        )}
        max={max}
        min={min}
        onChange={(event) => {
          const nextInputValue = event.target.value;
          onInputValueChange?.(nextInputValue);

          if (nextInputValue.trim() === "") {
            if (!allowEmpty) {
              onChange(clamp(0));
            }
            return;
          }

          const parsed = Number(nextInputValue);
          if (Number.isFinite(parsed)) {
            onChange(clamp(parsed));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" && event.shiftKey) {
            event.preventDefault();
            applyDelta(stepLarge);
          }
          if (event.key === "ArrowDown" && event.shiftKey) {
            event.preventDefault();
            applyDelta(-stepLarge);
          }
          onKeyDown?.(event);
        }}
        onBlur={onBlur}
        step={step}
        type="number"
        value={renderedValue}
        {...rest}
      />
      {showButtons ? (
        <Button
          className="h-8 w-8 shrink-0"
          onClick={() => applyDelta(step)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
