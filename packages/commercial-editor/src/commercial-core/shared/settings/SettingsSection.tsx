interface SettingsSectionProps {
  children: React.ReactNode;
  description?: string;
  title: string;
}

export const SettingsSection = ({
  title,
  description,
  children,
}: SettingsSectionProps) => (
  <div className="space-y-2">
    <div className="space-y-0.5">
      <h3 className="font-semibold text-sm">{title}</h3>
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
    </div>
    {children}
  </div>
);
