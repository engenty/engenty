import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn";

/** Deep marketing fills — cream type, same language as the login ember rail. */
export const BAND_FILL = {
  ember: "oklch(44% 0.16 30)",
  cobalt: "oklch(38% 0.16 264)",
  moss: "oklch(36% 0.12 150)",
  rose: "oklch(42% 0.16 18)",
  amber: "oklch(48% 0.14 68)",
} as const;

export type BandTone = keyof typeof BAND_FILL;

export const BAND_CREAM = "oklch(88% 0.11 75)";
export const BAND_MUTED = "oklch(92% 0.03 40)";
export const BAND_SOFT = "oklch(100% 0 0 / 0.55)";

export type HighlightCorner = "tr" | "tl" | "br" | "bl";

const HIGHLIGHT_POS: Record<HighlightCorner, CSSProperties> = {
  bl: { bottom: -180, left: -160 },
  br: { bottom: -180, right: -160 },
  tl: { top: -180, left: -160 },
  tr: { top: -180, right: -160 },
};

export function ColorBand({
  children,
  className,
  highlight = "tr",
  id,
  tone,
}: {
  children: ReactNode;
  className?: string;
  highlight?: HighlightCorner;
  id?: string;
  tone: BandTone;
}) {
  return (
    <section
      className={cn("relative", className)}
      id={id}
      style={{ background: BAND_FILL[tone] }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            background: "#fff",
            filter: "blur(90px)",
            height: 520,
            opacity: 0.12,
            width: 520,
            ...HIGHLIGHT_POS[highlight],
          }}
        />
      </div>
      <div className="relative z-10">{children}</div>
    </section>
  );
}
