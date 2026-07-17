"use client";

import type { ObjectDisplayItem, ObjectRef } from "@engenty/ai-core/browser";
import { formatObjectRef } from "@engenty/ai-core/browser";
import { Badge, cn } from "@engenty/ui-core";
import { Box } from "lucide-react";

/**
 * Generic snapshot-based card for refs with no registered object widget —
 * the module isn't installed/loaded in this shell, or the type is unknown.
 * Renders the persisted display snapshot only; degrades, never crashes.
 */

const FALLBACK_INLINE_LIMIT = 8;

export function ObjectFallbackCard({
  refs,
  items,
  className,
}: {
  refs: ObjectRef[];
  items?: ObjectDisplayItem[];
  className?: string;
}) {
  const itemByRef = new Map(
    (items ?? []).map((item) => [item.ref, item] as const)
  );
  const shown = refs.slice(0, FALLBACK_INLINE_LIMIT);
  const overflow = refs.length - shown.length;

  return (
    <div
      className={cn(
        "ui-canvas-raised my-1 w-full overflow-hidden rounded-lg border-0 bg-card",
        className
      )}
    >
      <ul className="divide-y divide-border/50">
        {shown.map((ref) => {
          const key = formatObjectRef(ref);
          const item = itemByRef.get(key);
          return (
            <li className="flex items-center gap-2.5 px-3 py-2" key={key}>
              <Box className="size-4 shrink-0 text-muted-foreground/70" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-foreground/90 text-sm">
                  {item?.title ?? key}
                </div>
                {item?.subtitle ? (
                  <div className="truncate text-muted-foreground text-xs">
                    {item.subtitle}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 text-muted-foreground/70 text-xs">
                {ref.module}
              </span>
              {item?.status ? (
                <Badge className="shrink-0" variant="outline">
                  {item.status}
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
      {overflow > 0 ? (
        <div className="border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs">
          +{overflow} more
        </div>
      ) : null}
    </div>
  );
}
