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
  <div className="space-y-3">
    <div className="space-y-1">
      <h3 className="font-semibold text-base">{title}</h3>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
    {children}
  </div>
);
