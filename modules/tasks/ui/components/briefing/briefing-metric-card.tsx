import { Card, cn } from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface BriefingMetricCardProps {
  description?: ReactNode;
  icon: LucideIcon;
  label: string;
  to?: string;
  value: number | string;
}

export function BriefingMetricCard({
  description,
  icon: Icon,
  label,
  to,
  value,
}: BriefingMetricCardProps) {
  const inner = (
    <Card
      className={cn(
        "h-full border-border/60 bg-card/50",
        to && "transition-colors hover:bg-accent/30"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-2xl tabular-nums tracking-tight sm:text-3xl">
            {value}
          </p>
          <p className="mt-1 font-medium text-muted-foreground text-xs sm:text-sm">
            {label}
          </p>
          {description ? (
            <div className="mt-1.5 hidden text-muted-foreground/70 text-xs sm:block">
              {description}
            </div>
          ) : null}
        </div>
        <Icon className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
      </div>
    </Card>
  );

  if (to) {
    return (
      <Link className="block h-full text-inherit no-underline" to={to}>
        {inner}
      </Link>
    );
  }

  return inner;
}
