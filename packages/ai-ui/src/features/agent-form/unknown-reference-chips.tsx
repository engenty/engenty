// Warning chips for saved capability references that no longer resolve.
// Rendered above pickers so stale ids are visible + removable, never dropped.

import { Badge } from "@engenty/ui-core";
import { TriangleAlert, X } from "lucide-react";

export function UnknownReferenceChips({
  ids,
  label,
  onRemove,
  removeLabel,
}: {
  ids: string[];
  label: string;
  onRemove: (id: string) => void;
  removeLabel: string;
}) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1.5">
      <p className="flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-500">
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <Badge
            className="gap-1 border-amber-500/40 font-mono"
            key={id}
            variant="outline"
          >
            {id}
            <button
              aria-label={`${removeLabel} ${id}`}
              className="rounded-full p-0.5 hover:bg-muted"
              onClick={() => onRemove(id)}
              type="button"
            >
              <X aria-hidden className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
