// Old-school pilot goggles — brass-rimmed lens over the eye, leather strap
// round the body — in the shared 0..120 space, so the same group sits on the
// flat SVG engenty and, as an overlay, on the 3D one. The copilot wears them.
//
// `shaded` is the 3D engenty's pair: domed glass with a specular glint, a
// bevelled brass rim lit from the upper left (the fur shader's key light), a
// strap that curves round the body and darkens where it turns away, and a
// soft shadow on the body under all of it.

import { useId } from "react";
import type { EngentyKind } from "./colors";
import { ENGENTY_FORMS } from "./forms";

const LEATHER = "oklch(40% 0.07 50)";
const LEATHER_DARK = "oklch(30% 0.06 45)";
const LEATHER_LIGHT = "oklch(52% 0.08 55)";
const BRASS = "oklch(74% 0.12 80)";
const BRASS_DARK = "oklch(55% 0.1 70)";
const BRASS_LIGHT = "oklch(90% 0.08 90)";
const GLASS = "oklch(88% 0.05 220 / 0.32)";

/** Where the body's outline crosses row `y`, from the form's blobs. */
function rowExtent(kind: EngentyKind, y: number): [number, number] {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const blob of ENGENTY_FORMS[kind].blobs) {
    const rx = blob.r * (blob.rx ?? 1);
    const ry = blob.r * (blob.ry ?? 1);
    const dy = (y - blob.y) / ry;
    if (Math.abs(dy) >= 1) {
      continue;
    }
    const half = rx * Math.sqrt(1 - dy * dy);
    left = Math.min(left, blob.x - half);
    right = Math.max(right, blob.x + half);
  }
  return [left, right];
}

interface Geometry {
  band: number;
  left: number;
  lens: number;
  outer: number;
  right: number;
  rim: number;
  x: number;
  y: number;
}

function geometry(kind: EngentyKind): Geometry {
  const { x, y, r } = ENGENTY_FORMS[kind].eye;
  const lens = r * 1.45;
  const rim = r * 0.42;
  const [left, right] = rowExtent(kind, y);
  return {
    band: r * 0.95,
    left,
    lens,
    outer: lens + rim / 2,
    right,
    rim,
    x,
    y,
  };
}

function FlatGoggles({ g }: { g: Geometry }) {
  const strap = (from: number, to: number) =>
    to - from > 1 ? (
      <g>
        <rect
          fill={LEATHER}
          height={g.band}
          rx={g.band * 0.3}
          width={to - from}
          x={from}
          y={g.y - g.band / 2}
        />
        <line
          stroke={LEATHER_DARK}
          strokeDasharray="1.6 1.6"
          strokeWidth={0.6}
          x1={from + 1}
          x2={to - 1}
          y1={g.y}
          y2={g.y}
        />
      </g>
    ) : null;
  return (
    <g className="e-goggles">
      {strap(g.left + 1.5, g.x - g.outer + 0.5)}
      {strap(g.x + g.outer - 0.5, g.right - 1.5)}
      <circle cx={g.x} cy={g.y} fill={GLASS} r={g.lens} />
      <circle
        cx={g.x}
        cy={g.y}
        fill="none"
        r={g.lens}
        stroke={BRASS}
        strokeWidth={g.rim}
      />
      <circle
        cx={g.x}
        cy={g.y}
        fill="none"
        r={g.outer}
        stroke={BRASS_DARK}
        strokeWidth={0.7}
      />
      {[45, 135, 225, 315].map((deg) => (
        <circle
          cx={g.x + Math.cos((deg * Math.PI) / 180) * g.lens}
          cy={g.y + Math.sin((deg * Math.PI) / 180) * g.lens}
          fill={BRASS_DARK}
          key={deg}
          r={0.9}
        />
      ))}
      <path
        d={`M ${g.x - g.lens * 0.62} ${g.y - g.lens * 0.2} A ${g.lens * 0.66} ${g.lens * 0.66} 0 0 1 ${g.x - g.lens * 0.1} ${g.y - g.lens * 0.64}`}
        fill="none"
        opacity={0.75}
        stroke="#fff"
        strokeLinecap="round"
        strokeWidth={1.3}
      />
    </g>
  );
}

/** A strap half that bows round the body: `sag` down at the body's middle. */
function strapPath(g: Geometry, from: number, to: number): string {
  const sag = g.band * 0.45;
  const mid = (g.left + g.right) / 2;
  const at = (x: number) => {
    const t = (x - mid) / ((g.right - g.left) / 2 || 1);
    return g.y + sag * (1 - t * t) - sag;
  };
  const top = (x: number) => at(x) - g.band / 2;
  const bottom = (x: number) => at(x) + g.band / 2;
  const cx = (from + to) / 2;
  return [
    `M ${from} ${top(from)}`,
    `Q ${cx} ${top(cx) + (top(cx) - (top(from) + top(to)) / 2)} ${to} ${top(to)}`,
    `L ${to} ${bottom(to)}`,
    `Q ${cx} ${bottom(cx) + (bottom(cx) - (bottom(from) + bottom(to)) / 2)} ${from} ${bottom(from)}`,
    "Z",
  ].join(" ");
}

function ShadedGoggles({ g }: { g: Geometry }) {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  const leftFrom = g.left + 0.5;
  const leftTo = g.x - g.outer + 0.8;
  const rightFrom = g.x + g.outer - 0.8;
  const rightTo = g.right - 0.5;
  return (
    <g className="e-goggles">
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${id}-strap`}
          x1={g.left}
          x2={g.right}
          y1="0"
          y2="0"
        >
          <stop offset="0" stopColor={LEATHER_DARK} />
          <stop offset="0.3" stopColor={LEATHER_LIGHT} />
          <stop offset="0.7" stopColor={LEATHER} />
          <stop offset="1" stopColor={LEATHER_DARK} />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={BRASS_LIGHT} />
          <stop offset="0.45" stopColor={BRASS} />
          <stop offset="1" stopColor={BRASS_DARK} />
        </linearGradient>
        <radialGradient cx="0.38" cy="0.32" id={`${id}-glass`} r="0.75">
          <stop offset="0" stopColor="oklch(97% 0.03 220 / 0.22)" />
          <stop offset="0.7" stopColor="oklch(80% 0.06 225 / 0.3)" />
          <stop offset="1" stopColor="oklch(45% 0.06 240 / 0.55)" />
        </radialGradient>
        <filter height="2" id={`${id}-shadow`} width="2" x="-0.5" y="-0.5">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      <g filter={ref("shadow")} opacity={0.35} transform="translate(0.6 2)">
        <path d={strapPath(g, leftFrom, rightTo)} fill="#000" />
        <circle cx={g.x} cy={g.y} fill="#000" r={g.outer} />
      </g>

      {leftTo - leftFrom > 1 ? (
        <path d={strapPath(g, leftFrom, leftTo)} fill={ref("strap")} />
      ) : null}
      {rightTo - rightFrom > 1 ? (
        <path d={strapPath(g, rightFrom, rightTo)} fill={ref("strap")} />
      ) : null}

      <circle cx={g.x} cy={g.y} fill={ref("glass")} r={g.lens} />
      <circle
        cx={g.x}
        cy={g.y}
        fill="none"
        r={g.lens}
        stroke={ref("rim")}
        strokeWidth={g.rim}
      />
      <circle
        cx={g.x}
        cy={g.y}
        fill="none"
        r={g.lens - g.rim / 2}
        stroke="oklch(20% 0.03 60 / 0.45)"
        strokeWidth={0.8}
      />
      <circle
        cx={g.x}
        cy={g.y}
        fill="none"
        r={g.outer}
        stroke={BRASS_DARK}
        strokeWidth={0.6}
      />
      {[45, 135, 225, 315].map((deg) => {
        const cx = g.x + Math.cos((deg * Math.PI) / 180) * g.lens;
        const cy = g.y + Math.sin((deg * Math.PI) / 180) * g.lens;
        return (
          <g key={deg}>
            <circle cx={cx} cy={cy} fill={BRASS_DARK} r={1} />
            <circle cx={cx - 0.3} cy={cy - 0.3} fill={BRASS_LIGHT} r={0.4} />
          </g>
        );
      })}
      <ellipse
        cx={g.x - g.lens * 0.36}
        cy={g.y - g.lens * 0.4}
        fill="#fff"
        opacity={0.8}
        rx={g.lens * 0.28}
        ry={g.lens * 0.14}
        transform={`rotate(-35 ${g.x - g.lens * 0.36} ${g.y - g.lens * 0.4})`}
      />
      <circle
        cx={g.x + g.lens * 0.42}
        cy={g.y + g.lens * 0.38}
        fill="#fff"
        opacity={0.45}
        r={g.lens * 0.07}
      />
    </g>
  );
}

export function EngentyGoggles({
  kind,
  shaded = false,
}: {
  kind: EngentyKind;
  shaded?: boolean;
}) {
  const g = geometry(kind);
  return shaded ? <ShadedGoggles g={g} /> : <FlatGoggles g={g} />;
}
