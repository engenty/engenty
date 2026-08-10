// Two-line label for role / profile pickers: readable title first, muted id
// underneath. Keeps long connection.* ids from dominating the select list.

export function RoleOptionLabel({ title, id }: { title: string; id: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 text-left">
      <span className="truncate leading-tight">{title || id}</span>
      <span className="truncate font-mono text-[11px] text-muted-foreground leading-tight">
        {id}
      </span>
    </span>
  );
}
