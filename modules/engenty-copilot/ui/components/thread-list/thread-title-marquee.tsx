import { cn } from "@engenty/ui-core";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const FADE_PX = 16;

/** Truncated title that scrolls the full string into view on hover (Claude-style). */
export function ThreadTitleMarquee(props: {
  className?: string;
  text: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [offsetPx, setOffsetPx] = useState(0);
  const [hovering, setHovering] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!(container && text)) {
      return;
    }
    setOffsetPx(Math.max(0, text.scrollWidth - container.clientWidth));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, props.text]);

  const durationSec =
    offsetPx > 0 ? Math.min(8, Math.max(1.2, offsetPx / 45)) : 0;
  const overflowing = offsetPx > 0;
  // Rest: fade the clipped trailing edge. Hover-scroll: fade the leading edge
  // (and keep a light trailing fade until the scroll finishes).
  const maskImage = overflowing
    ? hovering
      ? `linear-gradient(to right, transparent, black ${FADE_PX}px, black calc(100% - ${FADE_PX}px), transparent)`
      : `linear-gradient(to right, black calc(100% - ${FADE_PX}px), transparent)`
    : undefined;

  return (
    <span
      className={cn("min-w-0 flex-1 overflow-hidden", props.className)}
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
      style={
        maskImage
          ? {
              maskImage,
              WebkitMaskImage: maskImage,
            }
          : undefined
      }
    >
      <span
        className="inline-block max-w-none whitespace-nowrap text-[13px] leading-none transition-transform ease-linear"
        ref={textRef}
        style={
          hovering && offsetPx > 0
            ? {
                transform: `translateX(-${offsetPx}px)`,
                transitionDuration: `${durationSec}s`,
              }
            : {
                transform: "translateX(0)",
                transitionDuration: hovering ? "0s" : "0.35s",
              }
        }
        title={props.text}
      >
        {props.text}
      </span>
    </span>
  );
}
