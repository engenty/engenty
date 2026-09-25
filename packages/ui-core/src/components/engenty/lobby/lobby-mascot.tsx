"use client";

import { useEffect, useRef, useState } from "react";
import type { EngentyKind } from "../colors";
import { FluffyEngenty } from "../fluffy-engenty";

/** The coat renders at this size; the wrapper scales it to fit its box. */
const RENDER = 220;
/** The coat pads its form, so the render is zoomed to fill the box like the
 *  flat mark does, centred on the box. */
const ZOOM = 1.5;

/** Short, calm jelly coat, as on the www landing. */
const COAT = { clarity: 0.3, fur: 5, thick: 1.1, wind: 0.25 };

/**
 * A jelly-coated (WebGL) engenty that fills the width of its box, for the
 * lobby. `FluffyEngenty` renders at a fixed pixel size, so this measures its
 * box and scales the render to it; the lobby scales with the viewport and the
 * cast follows. Falls back to the flat mark by itself.
 */
export function LobbyMascot({
  className,
  kind,
}: {
  className?: string;
  kind: EngentyKind;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / RENDER);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      aria-hidden="true"
      className={className}
      ref={box}
      style={{
        aspectRatio: "1",
        display: "block",
        position: "relative",
        width: "100%",
      }}
    >
      <span
        style={{
          display: "block",
          height: RENDER,
          left: "50%",
          position: "absolute",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${scale * ZOOM})`,
          visibility: scale > 0 ? "visible" : "hidden",
          width: RENDER,
        }}
      >
        <FluffyEngenty
          coat="jelly"
          kind={kind}
          overrides={COAT}
          quality="medium"
          size={RENDER}
        />
      </span>
    </span>
  );
}
