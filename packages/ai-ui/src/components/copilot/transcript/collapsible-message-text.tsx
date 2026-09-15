// A messenger reads in messages, not memos. An assistant reply taller than a
// screenful folds to its first lines with a "Show more" — the whole text is
// still there, one click away, and the transcript stays a conversation. A
// reply still streaming never folds (the fold would fight the growth); a
// reply the person opened stays open.
"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Folded height: roughly twelve lines of chat text. */
export const COLLAPSED_MESSAGE_MAX_PX = 300;
/** Do not fold for a few lines' gain — the button costs a line itself. */
const FOLD_SLACK_PX = 80;

export function CollapsibleMessageText(props: {
  children: ReactNode;
  className?: string;
  /** True while this text is still being written — never fold it then. */
  streaming?: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    setOverflows(node.scrollHeight > COLLAPSED_MESSAGE_MAX_PX + FOLD_SLACK_PX);
  }, []);

  useLayoutEffect(() => {
    if (props.streaming) {
      return;
    }
    measure();
    const node = ref.current;
    if (!(node && typeof ResizeObserver === "function")) {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, props.streaming]);

  const folded = overflows && !open && !props.streaming;

  return (
    <div className={cn("relative", props.className)}>
      <div
        className={cn(folded && "overflow-hidden")}
        ref={ref}
        style={folded ? { maxHeight: COLLAPSED_MESSAGE_MAX_PX } : undefined}
      >
        {props.children}
      </div>
      {folded ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background to-transparent" />
      ) : null}
      {overflows && !props.streaming ? (
        <button
          className="relative mt-1 text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setOpen((prev) => !prev)}
          type="button"
        >
          {open ? t("transcript.showLess") : t("transcript.showMore")}
        </button>
      ) : null}
    </div>
  );
}
