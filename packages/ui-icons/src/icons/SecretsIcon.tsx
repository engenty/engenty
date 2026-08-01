import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

/** One vertical skeleton key — bow + shaft + bits (macOS Passwords motif). */
function SkeletonKey({ cx, headFill }: { cx: number; headFill: string }) {
  const bow = [
    `M${cx} 4.2a2.15 2.15 0 1 1 0 4.3 2.15 2.15 0 0 1 0-4.3`,
    "m0 1.35a0.8 0.8 0 1 0 0 1.6 0.8 0.8 0 0 0 0-1.6z",
  ].join("");

  return (
    <g>
      <path
        d={bow}
        fill={headFill}
        fillOpacity={0.88}
        fillRule="evenodd"
        stroke="none"
      />
      <path d={`M${cx} 8.6v10.2`} />
      <path d={`M${cx} 14.7h1.65`} />
      <path d={`M${cx} 17.2h1.35`} />
    </g>
  );
}

/**
 * Dock glyph for Secrets — three colored skeleton keys (no frame),
 * inspired by the macOS Passwords app icon.
 */
export function DockSecretsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>Secrets</title>
      <SkeletonKey cx={8} headFill={dockBrandFill.amber} />
      <SkeletonKey cx={12} headFill={dockBrandFill.moss} />
      <SkeletonKey cx={16} headFill={dockBrandFill.cobalt} />
    </svg>
  );
}
