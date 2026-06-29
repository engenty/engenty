interface IndexStatProps {
  emphasis?: "default" | "destructive";
  hint?: string;
  label: string;
  value: string;
}

export function DevelopmentIndexStat({
  emphasis = "default",
  hint,
  label,
  value,
}: IndexStatProps) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </div>
      <div
        className={
          emphasis === "destructive"
            ? "mt-1 font-semibold text-2xl text-destructive tabular-nums"
            : "mt-1 font-semibold text-2xl tabular-nums"
        }
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-muted-foreground text-xs">{hint}</div>
      ) : null}
    </div>
  );
}
