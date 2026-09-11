import type { ReactNode } from "react";

export function ProductFrame({
  children,
  crumb,
}: {
  children: ReactNode;
  crumb: string;
}) {
  return (
    <div className="www-mock ui-card-elevated overflow-hidden bg-card">
      <div className="flex items-center gap-2 bg-paper-2 px-3 py-2">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-paper-2 ring-1 ring-ink/10" />
          <span className="size-2 rounded-full bg-paper-2 ring-1 ring-ink/10" />
          <span className="size-2 rounded-full bg-paper-2 ring-1 ring-ink/10" />
        </span>
        <span className="font-mono text-[11px] text-ink-3">{crumb}</span>
      </div>
      {children}
    </div>
  );
}
