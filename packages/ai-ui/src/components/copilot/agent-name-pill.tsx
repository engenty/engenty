"use client";

// Avatar + name as a capsule, used on "Message from" / "Messaged" rows so an
// Engenty reads as a chip rather than loose type next to the blob.

import { cn, Engenty, type EngentyKind } from "@engenty/ui-core";

export function AgentNamePill({
  className,
  kind,
  name,
}: {
  className?: string;
  kind: EngentyKind;
  name: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-px rounded-full bg-primary/15 py-px pr-1.5 pl-px font-medium text-primary text-xs leading-none",
        className
      )}
    >
      <Engenty
        animated={false}
        className="shrink-0 [&_.e-shadow]:hidden"
        kind={kind}
        size={14}
      />
      <span>{name}</span>
    </span>
  );
}
