import { cn } from "@engenty/ui-core";

export function AgentPulseDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 animate-pulse rounded-full bg-primary",
        className
      )}
    />
  );
}
