import { cn } from "@engenty/ui-core";

interface InfoItem {
  action?: React.ReactNode;
  label: string;
  /**
   * `row` (default) — label left, value/action right.
   * `stack` — label above value/action (better for long titles).
   */
  layout?: "row" | "stack";
  value: React.ReactNode;
}

interface SettingsInfoCardProps {
  items: InfoItem[];
}

export const SettingsInfoCard = ({ items }: SettingsInfoCardProps) => (
  <div className="ui-card-panel overflow-hidden p-4">
    <div className="grid gap-3 text-sm">
      {items.map((item, index) => {
        const stacked = item.layout === "stack";
        return (
          <div
            className={cn(
              stacked
                ? "flex flex-col gap-1"
                : "flex items-center justify-between gap-3"
            )}
            key={index}
          >
            <span className="shrink-0 text-muted-foreground">{item.label}</span>
            {item.action ? (
              <div className={cn(stacked && "w-full min-w-0")}>
                {item.action}
              </div>
            ) : (
              <span
                className={cn(
                  "font-medium text-sm",
                  stacked ? "break-words" : "text-right"
                )}
              >
                {item.value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
