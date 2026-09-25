// A messenger reads in messages, not memos. An assistant reply taller than
// most of the screen folds to its first half-screen with a "Show more" — the
// whole text is still there, one click away, and the transcript stays a
// conversation. The newest reply never folds: it is the one being read. A
// reply still streaming never folds either (the fold would fight the
// growth); a reply the person opened stays open.
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
import { observeElementResize } from "./shared-resize-observer.js";

/** A reply folds once it is taller than this share of the window… */
const FOLD_ABOVE_VIEWPORT = 0.7;
/** …down to this share, so a fold always hides a real stretch of text. */
const FOLDED_VIEWPORT = 0.5;
const FOLD_MASK =
  "linear-gradient(to bottom, black calc(100% - 4rem), transparent)";

export function CollapsibleMessageText(props: {
  children: ReactNode;
  className?: string;
  /** False for the newest reply — it is the one being read. */
  fold?: boolean;
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
    setOverflows(node.scrollHeight > window.innerHeight * FOLD_ABOVE_VIEWPORT);
  }, []);

  const foldable = props.fold !== false && !props.streaming;

  useLayoutEffect(() => {
    if (!foldable) {
      return;
    }
    measure();
    const node = ref.current;
    if (!node) {
      return;
    }
    return observeElementResize(node, measure);
  }, [foldable, measure]);

  const folded = foldable && overflows && !open;

  return (
    <div className={cn("relative", props.className)}>
      <div
        className={cn(folded && "overflow-hidden")}
        ref={ref}
        // Folded text fades out by mask, not by an overlay painted in the
        // canvas colour — the same fold works inside a bubble.
        style={
          folded
            ? {
                maxHeight: `${FOLDED_VIEWPORT * 100}vh`,
                maskImage: FOLD_MASK,
                WebkitMaskImage: FOLD_MASK,
              }
            : undefined
        }
      >
        {props.children}
      </div>
      {foldable && overflows ? (
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
