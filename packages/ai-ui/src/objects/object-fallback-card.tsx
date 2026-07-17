"use client";

import type { ObjectDisplayItem, ObjectRef } from "@engenty/ai-core/browser";
import { formatObjectRef } from "@engenty/ai-core/browser";
import { Badge } from "@engenty/ui-core";
import { Box } from "lucide-react";
import {
  ObjectCardFrame,
  ObjectListRow,
  ObjectRowList,
} from "./object-list.js";

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
    <ObjectCardFrame className={className}>
      <ObjectRowList>
        {shown.map((ref) => {
          const key = formatObjectRef(ref);
          const item = itemByRef.get(key);
          return (
            <ObjectListRow
              key={key}
              media={<Box className="size-4 text-muted-foreground/70" />}
              meta={ref.module}
              subtitle={item?.subtitle}
              title={item?.title ?? key}
              trailing={
                item?.status ? (
                  <Badge className="shrink-0" variant="outline">
                    {item.status}
                  </Badge>
                ) : null
              }
            />
          );
        })}
      </ObjectRowList>
      {overflow > 0 ? (
        <div className="border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs">
          +{overflow} more
        </div>
      ) : null}
    </ObjectCardFrame>
  );
}
