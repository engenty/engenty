"use client";

import {
  formatObjectRef,
  type ObjectRef,
  readObjectRenderMeta,
} from "@engenty/ai-core/browser";
import { Box } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useObjectWidgets } from "./object-widget-registry.js";

/**
 * Upgrades module deep links the assistant merely *mentions* in prose
 * (`[ACME](/mdl/contacts/<id>)`) to entity chips under the message — the
 * cheap sibling of the full `show_objects` card. Skipped when the message
 * already renders objects (a tool part carries `object_render`), so nothing
 * shows twice.
 */

const MENTION_LIMIT = 6;

const MD_INTERNAL_LINK =
  /\[([^\]]+)\]\(\s*(?:https?:\/\/[^/)\s]+)?(\/mdl\/[^)\s]+?)\s*\)/g;

interface Mention {
  href: string;
  ref: ObjectRef;
  title: string;
}

export function ObjectRefMentions({
  parts,
  text,
}: {
  parts: readonly unknown[];
  text: string;
}) {
  const widgets = useObjectWidgets();

  const mentions = useMemo((): Mention[] => {
    if (widgets.length === 0 || !text.includes("/mdl/")) {
      return [];
    }
    const alreadyRendersObjects = parts.some((part) => {
      const output = (part as { output?: unknown } | null)?.output;
      return readObjectRenderMeta(output) !== null;
    });
    if (alreadyRendersObjects) {
      return [];
    }
    const found: Mention[] = [];
    const seen = new Set<string>();
    MD_INTERNAL_LINK.lastIndex = 0;
    let match: RegExpExecArray | null;
    while (found.length < MENTION_LIMIT) {
      match = MD_INTERNAL_LINK.exec(text);
      if (!match) {
        break;
      }
      const title = match[1]?.trim();
      const pathname = match[2]?.trim();
      if (!(title && pathname)) {
        continue;
      }
      for (const widget of widgets) {
        const ref = widget.matchHref?.(pathname) ?? null;
        if (ref) {
          const key = formatObjectRef(ref);
          if (!seen.has(key)) {
            seen.add(key);
            found.push({ href: pathname, ref, title });
          }
          break;
        }
      }
    }
    return found;
  }, [widgets, text, parts]);

  if (mentions.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 mb-0.5 flex flex-wrap gap-1.5">
      {mentions.map((mention) => (
        <Link
          className="inline-flex max-w-64 items-center gap-1.5 rounded-full bg-muted/60 py-1 pr-3 pl-2 text-foreground/80 text-xs ring-1 ring-border/50 transition-colors hover:bg-muted hover:text-foreground"
          key={formatObjectRef(mention.ref)}
          to={mention.href}
        >
          <Box className="size-3 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{mention.title}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground/60">
            {mention.ref.module}
          </span>
        </Link>
      ))}
    </div>
  );
}
