import { cn } from "@engenty/ui-core";

interface SettingsCardProps {
  children: React.ReactNode;
  className?: string;
}

export const SettingsCard = ({ children, className }: SettingsCardProps) => (
  <div className={cn("ui-card-panel overflow-hidden", className)}>
    {children}
  </div>
);

interface SettingsCardItemProps {
  children: React.ReactNode;
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
