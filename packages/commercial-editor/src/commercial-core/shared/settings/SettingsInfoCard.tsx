interface InfoItem {
  action?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

interface SettingsInfoCardProps {
  items: InfoItem[];
}

export const SettingsInfoCard = ({ items }: SettingsInfoCardProps) => (
  <div className="overflow-hidden rounded-lg border bg-card p-4">
    <div className="grid gap-3 text-sm">
      {items.map((item, index) => (
        <div className="flex items-center justify-between" key={index}>
          <span className="text-muted-foreground">{item.label}</span>
          {item.action ? (
            item.action
          ) : (
            <span className="font-medium text-sm">{item.value}</span>
          )}
        </div>
      ))}
    </div>
  </div>
);
