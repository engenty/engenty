"use client";

import type { ObjectRef } from "@engenty/ai-core/browser";
import { PageHeaderProvider, usePageHeader } from "@engenty/ui-plugin-sdk";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ObjectFallbackCard } from "./object-fallback-card.js";
import { useObjectWidget } from "./object-widget-registry.js";

/** The embedded page's own topbar actions, kept with it inside the pane. */
function PanelWithPageActions({ children }: { children: ReactNode }) {
  const { actions } = usePageHeader();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 border-border-soft border-b px-2 py-1.5">
          {actions}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Pane body for an object tab: the module's `panel` renderer when registered,
 * else its inline `card` (single ref), else the generic fallback. Always
 * offers the module route as the escape hatch.
 *
 * A panel is usually the module's own page rendered embedded, and a page sets
 * the shell's breadcrumbs and topbar actions through `usePageConfig`. The
 * breadcrumbs belong to the page the pane sits beside, so a second
 * `PageHeaderProvider` keeps them out of it — the same trick the space home
 * uses to embed a module's home page. Its ACTIONS are a different matter:
 * "Speichern" on a draft editor is the page's, and a pane that swallowed it
 * would let a reader type into a record they cannot save. They are rendered
 * above the panel instead, in the pane's own body.
 */
export function ObjectPaneBody({ objectRef }: { objectRef: ObjectRef }) {
  const widget = useObjectWidget(objectRef);
  const href = widget?.getHref?.(objectRef) ?? null;

  const body = (() => {
    if (widget?.panel) {
      const Panel = widget.panel;
      return (
        <PageHeaderProvider>
          <PanelWithPageActions>
            <Panel objectRef={objectRef} />
          </PanelWithPageActions>
        </PageHeaderProvider>
      );
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
        <div className="border-border-soft border-t px-3 py-2">
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
