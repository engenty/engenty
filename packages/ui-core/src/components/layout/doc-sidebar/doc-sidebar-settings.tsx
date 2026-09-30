/**
 * Building blocks for a doc sidebar's settings (`DocSidebarLayout`): a titled
 * section, a panel card with separated items, and a label/value info card.
 * Offers, invoices and projects compose their sidebars from these.
 */
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface SettingsSectionProps {
  /** Right of the title — icon buttons that act on the whole section. */
  action?: ReactNode;
  children: ReactNode;
  description?: string;
  title: string;
}

export const SettingsSection = ({
  action,
  title,
  description,
  children,
}: SettingsSectionProps) => (
  <div className="space-y-2">
    <div className="flex items-end justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <h3 className="font-semibold text-sm">{title}</h3>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      {action ? <div className="-mb-1 shrink-0">{action}</div> : null}
    </div>
    {children}
  </div>
);

interface SettingsCardProps {
  children: ReactNode;
  className?: string;
}

export const SettingsCard = ({ children, className }: SettingsCardProps) => (
  <div className={cn("ui-card-panel overflow-hidden", className)}>
    {children}
  </div>
);

interface SettingsCardItemProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const SettingsCardItem = ({
  children,
  className,
  noPadding = false,
}: SettingsCardItemProps) => (
  <div className={cn(!noPadding && "p-4", className)}>{children}</div>
);

export const SettingsCardSeparator = () => <div className="mx-4 border-b" />;

interface InfoItem {
  action?: ReactNode;
  label: string;
  /**
   * `row` (default) — label left, value/action right.
   * `stack` — label above value/action (better for long titles).
   */
  layout?: "row" | "stack";
  value: ReactNode;
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
