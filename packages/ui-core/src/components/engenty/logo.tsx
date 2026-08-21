"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { ENGENTY_CORE_KINDS, type EngentyKind } from "./colors";
import { Engenty } from "./engenty";

const CYCLE_MS = 2800;

/** Cycling engenty used as the brand mark. Cycles the founding five only —
 *  the mark is the thing people learn to recognise, so it does not drift
 *  through every shape the cast has since grown. */
export function EngentyLogoMark({ size = 72 }: { size?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % ENGENTY_CORE_KINDS.length),
      CYCLE_MS
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      aria-hidden="true"
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      {ENGENTY_CORE_KINDS.map((kind, i) => (
        <span
          className="absolute inset-0"
          key={kind}
          style={{
            opacity: i === index ? 1 : 0,
            transition: "opacity 0.45s ease",
          }}
        >
          <Engenty kind={kind as EngentyKind} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Wordmark with typographic period — engenty. */
export function EngentyWordmark({
  className,
  style,
  /** Lighter period for dark / ember bands. */
  onDark = false,
}: {
  className?: string;
  style?: CSSProperties;
  onDark?: boolean;
}) {
  return (
    <span className={className} style={style}>
      engenty
      <span
        style={{
          color: onDark
            ? "oklch(88% 0.11 75)"
            : "var(--ember, oklch(64% 0.195 35))",
        }}
      >
        .
      </span>
    </span>
  );
}
