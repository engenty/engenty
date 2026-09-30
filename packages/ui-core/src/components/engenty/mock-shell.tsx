import type { ReactNode } from "react";
import { cn } from "../../utils";
import type { EngentyKind } from "./colors";
import { Engenty } from "./engenty";

/**
 * A drawn app window for the landing and the setup wizard. CSS chrome that
 * follows the real shell (DESIGN.md → Shell chrome rules): app-bar rail on
 * paper, raised secondary column, main canvas. No borders on layout edges —
 * surface steps and the column's ambient shadow do the work.
 */
export function MockShell({
  bodyClassName = "min-h-[340px]",
  children,
  className,
  column,
  columnClassName = "w-52",
  rail,
  title,
}: {
  /** Height of the window body; the landing's hero mocks need the full 340px. */
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  column?: ReactNode;
  /** Width of the secondary column; the space home needs the full 208px, a plain list does not. */
  columnClassName?: string;
  rail: ReactNode;
  title: string;
}) {
  return (
    <div className={cn("overflow-hidden bg-paper text-ink text-sm", className)}>
      <div className="flex items-center gap-2 bg-paper-2 px-3 py-2">
        <span className="flex gap-1">
          <span className="size-2 rounded-full ring-1 ring-ink/10" />
          <span className="size-2 rounded-full ring-1 ring-ink/10" />
          <span className="size-2 rounded-full ring-1 ring-ink/10" />
        </span>
        <span className="font-mono text-[11px] text-ink-3">{title}</span>
      </div>
      <div className={cn("flex", bodyClassName)}>
        <aside className="hidden w-14 shrink-0 flex-col items-center gap-2.5 bg-paper py-2.5 sm:flex">
          {rail}
        </aside>
        {column ? (
          <aside
            className={cn(
              "hidden shrink-0 bg-card shadow-[1px_0_0_oklch(0%_0_0/0.04),6px_0_18px_oklch(0%_0_0/0.05)] md:block",
              columnClassName
            )}
          >
            {column}
          </aside>
        ) : null}
        <div className="min-w-0 flex-1 bg-card">{children}</div>
      </div>
    </div>
  );
}

export function SpaceTile({
  active = false,
  hue,
  label,
}: {
  active?: boolean;
  hue: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-[8px] font-heading font-semibold text-[11px] text-white",
        active && "ring-2 ring-ink/70 ring-offset-2 ring-offset-paper"
      )}
      style={{ background: hue }}
    >
      {label}
    </span>
  );
}

export function NewSpaceTile() {
  return (
    <span className="flex size-9 items-center justify-center rounded-[8px] border border-ink/20 border-dashed text-ink-3">
      +
    </span>
  );
}

export function PersonDot({
  hue,
  initials,
  size = 22,
}: {
  hue: string;
  initials: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-medium text-[10px] text-white ring-2 ring-card"
      style={{ background: hue, height: size, width: size }}
    >
      {initials}
    </span>
  );
}

export function AgentChip({
  kind,
  name,
  size = 22,
}: {
  kind: EngentyKind;
  name: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 py-0.5 pr-2 pl-0.5 text-[11px] text-ink-2">
      <Engenty animated={false} kind={kind} size={size} />
      {name}
    </span>
  );
}

export const PERSON_HUES = [
  "oklch(52% 0.12 264)",
  "oklch(56% 0.13 30)",
  "oklch(50% 0.11 150)",
  "oklch(54% 0.12 310)",
] as const;
