import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../../../lib/utils";

const FADE_PX = 16;

/**
 * Truncated sidebar-row title that scrolls the full string into view on hover.
 *
 * `endGutterPx` keeps the last characters clear of a trailing control (⋮),
 * so a long name does not park under the overflow button when it finishes
 * scrolling.
 *
 * `active` lets the ROW drive the scroll: a two-line row hovered on its name
 * should reveal its second line too, and the marquee's own hover only covers
 * the strip it occupies.
 */
export function SidebarRowTitleMarquee({
  active,
  className,
  endGutterPx = 0,
  text,
  textClassName,
}: {
  active?: boolean;
  className?: string;
  endGutterPx?: number;
  text: string;
  textClassName?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [offsetPx, setOffsetPx] = useState(0);
  const [hovering, setHovering] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const label = textRef.current;
    if (!(container && label)) {
      return;
    }
    const overflow = label.scrollWidth - container.clientWidth;
    setOffsetPx(Math.max(0, overflow));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, text]);

  useEffect(() => {
    if (active) {
      measure();
    }
  }, [active, measure]);

  const scrolling = hovering || active === true;
  const durationSec =
    offsetPx > 0 ? Math.min(8, Math.max(1.2, offsetPx / 45)) : 0;
  const overflowing = offsetPx > 0;
  const maskImage = overflowing
    ? scrolling
      ? `linear-gradient(to right, transparent, black ${FADE_PX}px, black calc(100% - ${FADE_PX}px), transparent)`
      : `linear-gradient(to right, black calc(100% - ${FADE_PX}px), transparent)`
    : undefined;

  return (
    <span
      className={cn("min-w-0 flex-1 overflow-hidden", className)}
      onBlur={() => setHovering(false)}
      onFocus={() => {
        measure();
        setHovering(true);
      }}
      onMouseEnter={() => {
        measure();
        setHovering(true);
      }}
      onMouseLeave={() => setHovering(false)}
      ref={containerRef}
      style={{
        ...(endGutterPx > 0 ? { marginRight: endGutterPx } : {}),
        ...(maskImage
          ? {
              maskImage,
              WebkitMaskImage: maskImage,
            }
          : {}),
      }}
    >
      <span
        className={cn(
          "inline-block max-w-none whitespace-nowrap transition-transform ease-linear",
          textClassName
        )}
        ref={textRef}
        style={
          scrolling && offsetPx > 0
            ? {
                transform: `translateX(-${offsetPx}px)`,
                transitionDuration: `${durationSec}s`,
              }
            : {
                transform: "translateX(0)",
                transitionDuration: scrolling ? "0s" : "0.35s",
              }
        }
        title={text}
      >
        {text}
      </span>
    </span>
  );
}
