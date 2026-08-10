import { Eye, EyeOff, RefreshCw } from "lucide-react";
import * as React from "react";
import {
  generateRandomPassword,
  type PasswordStrengthLevel,
  scorePasswordStrength,
} from "../../lib/password-input";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input } from "./input";
import { Progress } from "./progress";

export interface PasswordInputLabels {
  generate?: string;
  hide?: string;
  medium?: string;
  show?: string;
  strong?: string;
  weak?: string;
}

export interface PasswordInputProps extends Omit<
  React.ComponentProps<"input">,
  "type"
> {
  /** Optional class for the outer wrapper (input + strength). */
  containerClassName?: string;
  labels?: PasswordInputLabels;
  /** Called after a password is generated (in addition to onChange). */
  onGenerate?: (password: string) => void;
  /** Show generate button (default true). */
  showGenerate?: boolean;
  /** Show strength meter when value is non-empty (default true). */
  showStrength?: boolean;
  /** Show visibility toggle (default true). */
  showVisibilityToggle?: boolean;
}

const STRENGTH_BADGE_CLASS: Record<PasswordStrengthLevel, string> = {
  weak: "bg-red-500",
  medium: "bg-yellow-500",
  strong: "bg-green-500",
};

const DEFAULT_LABELS = {
  generate: "Generate password",
  hide: "Hide password",
  medium: "Medium",
  show: "Show password",
  strong: "Strong",
  weak: "Weak",
} as const satisfies Required<PasswordInputLabels>;

function resolveLabels(
  labels?: PasswordInputLabels
): Required<PasswordInputLabels> {
  return {
    generate: labels?.generate ?? DEFAULT_LABELS.generate,
    hide: labels?.hide ?? DEFAULT_LABELS.hide,
    medium: labels?.medium ?? DEFAULT_LABELS.medium,
    show: labels?.show ?? DEFAULT_LABELS.show,
    strong: labels?.strong ?? DEFAULT_LABELS.strong,
    weak: labels?.weak ?? DEFAULT_LABELS.weak,
  };
}

function emitChange(
  onChange: React.ChangeEventHandler<HTMLInputElement> | undefined,
  value: string
) {
  onChange?.({
    target: { value },
    currentTarget: { value },
  } as React.ChangeEvent<HTMLInputElement>);
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      containerClassName,
      disabled,
      labels: labelsProp,
      onChange,
      onGenerate,
      showGenerate = true,
      showStrength = true,
      showVisibilityToggle = true,
      value,
      ...props
    },
    ref
  ) => {
    const [visible, setVisible] = React.useState(false);
    const labels = resolveLabels(labelsProp);
    const password = typeof value === "string" ? value : "";
    const strength = scorePasswordStrength(password);
    const strengthLabel =
      strength.level === "strong"
        ? labels.strong
        : strength.level === "medium"
          ? labels.medium
          : labels.weak;

    const trailingCount =
      (showGenerate ? 1 : 0) + (showVisibilityToggle ? 1 : 0);

    const handleGenerate = () => {
      const next = generateRandomPassword();
      emitChange(onChange, next);
      onGenerate?.(next);
      setVisible(true);
    };

    return (
      <div className={cn("space-y-2", containerClassName)}>
        <div className="relative">
          <Input
            {...props}
            autoComplete={props.autoComplete ?? "new-password"}
            className={cn(
              trailingCount >= 2 ? "pr-20" : trailingCount === 1 ? "pr-10" : null,
              className
            )}
            disabled={disabled}
            onChange={onChange}
            ref={ref}
            type={visible ? "text" : "password"}
            value={value}
          />
          {trailingCount > 0 ? (
            <div className="absolute top-0 right-0 flex h-full items-center gap-0.5 pr-1">
              {showGenerate ? (
                <Button
                  aria-label={labels.generate}
                  className="h-8 w-8"
                  disabled={disabled}
                  onClick={handleGenerate}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
              {showVisibilityToggle ? (
                <Button
                  aria-label={visible ? labels.hide : labels.show}
                  className="h-8 w-8"
                  disabled={disabled}
                  onClick={() => setVisible((prev) => !prev)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {visible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {showStrength && password ? (
          <div className="flex items-center gap-2">
            <Progress className="h-2 flex-1" value={strength.score} />
            <Badge
              className={cn(
                STRENGTH_BADGE_CLASS[strength.level],
                "border-0 text-white"
              )}
              variant="outline"
            >
              {strengthLabel}
            </Badge>
          </div>
        ) : null}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
