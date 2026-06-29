export function DetailMetaStat({
  description,
  label,
  value,
}: {
  description?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 font-medium text-sm">{value}</p>
      {description ? (
        <p className="mt-1 text-muted-foreground text-xs">{description}</p>
      ) : null}
    </div>
  );
}

export function formatDetailTimestamp(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}
