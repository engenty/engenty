"use client";

import type { ObjectRef } from "@engenty/ai-core/browser";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { ObjectFallbackCard } from "./object-fallback-card.js";
import { useObjectWidget } from "./object-widget-registry.js";

/**
 * Pane body for an object tab: the module's `panel` renderer when registered,
 * else its inline `card` (single ref), else the generic fallback. Always
 * offers the module route as the escape hatch.
 */
export function ObjectPaneBody({ objectRef }: { objectRef: ObjectRef }) {
  const widget = useObjectWidget(objectRef);
  const href = widget?.getHref?.(objectRef) ?? null;

  const body = (() => {
    if (widget?.panel) {
      const Panel = widget.panel;
      return <Panel objectRef={objectRef} />;
    }
    if (widget) {
      const Card = widget.card;
      return (
        <div className="p-2">
          <Card refs={[objectRef]} />
        </div>
      );
    }
    return (
      <div className="p-2">
        <ObjectFallbackCard refs={[objectRef]} />
      </div>
    );
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {href ? (
        <div className="border-border/50 border-t px-3 py-2">
          <Link
            className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
            to={href}
          >
            Open full page
            <ExternalLink className="size-3" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
