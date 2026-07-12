// Shared colored pills for the roles console. Uses proven Tailwind palette
// classes (emerald/amber/destructive) with dark-mode variants — no bespoke
// tokens.
import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";

const TONE = {
  neutral: "border-border bg-muted text-foreground",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  accent:
    "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

export type PillTone = keyof typeof TONE;

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-medium text-[10px] uppercase leading-none tracking-wide",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Risk-level → pill tone. */
export function riskTone(risk: string): PillTone {
  if (risk === "high" || risk === "critical") {
    return "high";
  }
  if (risk === "medium") {
    return "medium";
  }
  return "low";
}
