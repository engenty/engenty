// Small pieces every setup screen uses: the labelled field, the error line,
// the quiet text link, the full-width submit, the ok/warn/fail mark, and the
// brand constants the wizard shares with the landing and the login rail.

import { Button, cn, Label } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Check, type LucideIcon, X } from "lucide-react";
import type { ReactNode } from "react";

/** Landing hero ember + cream accents (same as AuthLoginLayout). */
export const BRAND_EMBER = "oklch(44% 0.16 30)";
export const BRAND_CREAM = "oklch(88% 0.11 75)";
export const MONO = "ui-monospace, 'Cascadia Code', monospace";

/** Input metrics for the wizard: a notch roomier than in-app forms. */
export const SETUP_INPUT_CLASS = "h-10 rounded-[6px] bg-card text-[15px]";

export function Field({
  children,
  hint,
  htmlFor,
  label,
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="font-medium text-[13px] text-ink-2" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[12.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      className="rounded-[6px] bg-destructive/8 px-3 py-2 text-destructive text-sm"
      role="alert"
    >
      {message}
    </p>
  );
}

export function TextLink({
  children,
  className,
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "text-left text-[13px] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** A screen's full-width submit, with a spinner and its busy label while it runs. */
export function SubmitButton({
  busy,
  busyLabel,
  disabled,
  label,
}: {
  busy: boolean;
  busyLabel: string;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Button
      className="h-11 w-full text-[15px]"
      disabled={busy || disabled}
      type="submit"
    >
      {busy && <AnimatedLoaderIcon className="mr-1" play="always" size="sm" />}
      {busy ? busyLabel : label}
    </Button>
  );
}

export type MarkStatus = "ok" | "warn" | "fail";

export const MARK_TONE: Record<MarkStatus, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  fail: "text-destructive",
};

export function StatusMark({ status }: { status: MarkStatus }) {
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${MARK_TONE[status]}`}
    >
      {status === "ok" ? (
        <Check className="h-3.5 w-3.5" />
      ) : status === "fail" ? (
        <X className="h-3.5 w-3.5" />
      ) : (
        <span className="font-bold text-xs leading-none">!</span>
      )}
    </span>
  );
}

/** The modifier the app's ⌘O / Ctrl+O copilot shortcut uses on this machine. */
export function modKey(): string {
  return typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl";
}

/** Two letters for a space tile or a person dot. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0]?.slice(0, 2) ?? "");
  return letters.toUpperCase() || "··";
}

/**
 * A grouped choice: one pill per option, the chosen one raised, and one line
 * under it about the chosen option.
 */
export function SetupChoice<Value extends string>({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  /** Names the group for screen readers. */
  label: string;
  onChange: (value: Value) => void;
  options: readonly {
    hint: string;
    icon?: LucideIcon;
    label: string;
    value: Value;
  }[];
  value: Value;
}) {
  const chosen = options.find((option) => option.value === value);
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        aria-label={label}
        className="flex w-full rounded-[10px] bg-ink/[0.06] p-1"
        role="radiogroup"
      >
        {options.map((option) => {
          const on = option.value === value;
          const Icon = option.icon;
          return (
            <button
              aria-checked={on}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-2 rounded-[7px] px-2 text-[14px] transition",
                on
                  ? "bg-card font-medium text-ink shadow-sm"
                  : "text-ink-3 hover:text-ink"
              )}
              disabled={disabled}
              key={option.value}
              onClick={() => onChange(option.value)}
              role="radio"
              type="button"
            >
              {Icon ? <Icon className="size-4" /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="min-h-[2.6em] text-center text-[13px] text-ink-3 leading-snug">
        {chosen?.hint}
      </p>
    </div>
  );
}
