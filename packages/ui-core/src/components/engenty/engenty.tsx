"use client";

import { useEffect, useRef } from "react";
import { ENGENTY_FILL, type EngentyKind } from "./colors";
import { useEngentyGaze } from "./use-engenty-gaze";

export interface EngentyProps {
  /**
   * Idle SMIL morph + pointer gaze. Off for dense chrome (sidebar rows) so only
   * the selected agent spends cycles wobbling.
   */
  animated?: boolean;
  className?: string;
  kind?: EngentyKind;
  /** Pixel width/height of the SVG. */
  size?: number;
}

interface EyeOpts {
  ex: number;
  ey: number;
  ink: string;
  max: number;
  r: number;
}

function Eye({
  ex,
  ey,
  max,
  ink,
  r,
  blink = "5.2s",
}: EyeOpts & { blink?: string }) {
  const ry = r * 1.15;
  return (
    <g className="e-eye" data-ex={ex} data-ey={ey} data-max={max}>
      <ellipse cx={ex} cy={ey} fill="#fff" rx={r} ry={ry}>
        <animate
          attributeName="ry"
          dur={blink}
          keyTimes="0;0.92;0.95;1"
          repeatCount="indefinite"
          values={`${ry};${ry};${r * 0.1};${ry}`}
        />
      </ellipse>
      <circle className="e-pupil" cx={ex} cy={ey + 1} fill={ink} r={r * 0.48} />
      <circle
        className="e-glint"
        cx={ex - r * 0.25}
        cy={ey - r * 0.3}
        fill="#fff"
        r={r * 0.18}
      />
    </g>
  );
}

function RoundBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.cobalt}>
        <animate
          attributeName="d"
          dur="3.6s"
          repeatCount="indefinite"
          values="M60 22 Q96 26 96 62 Q96 96 60 100 Q24 96 24 62 Q24 26 60 22 Z;M60 30 Q100 20 94 62 Q98 102 60 95 Q22 102 26 62 Q20 22 60 30 Z;M60 22 Q96 26 96 62 Q96 96 60 100 Q24 96 24 62 Q24 26 60 22 Z"
        />
      </path>
      <circle cx="97" cy="34" fill={ENGENTY_FILL.cobalt} opacity="0.5" r="6">
        <animate
          attributeName="cy"
          dur="3.6s"
          repeatCount="indefinite"
          values="34;28;34"
        />
      </circle>
      <circle
        cx="106"
        cy="24"
        fill={ENGENTY_FILL.cobalt}
        opacity="0.35"
        r="3.5"
      >
        <animate
          attributeName="cy"
          begin="0.4s"
          dur="3.6s"
          repeatCount="indefinite"
          values="24;17;24"
        />
      </circle>
      <Eye
        blink="5.2s"
        ex={68}
        ey={58}
        ink="oklch(18% 0.08 260)"
        max={3.4}
        r={8}
      />
    </>
  );
}

function DropBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.amber}>
        <animate
          attributeName="d"
          dur="4.4s"
          repeatCount="indefinite"
          values="M60 16 Q90 34 90 66 Q90 96 60 98 Q30 96 30 66 Q30 34 60 16 Z;M50 20 Q92 30 88 66 Q92 98 60 96 Q28 98 32 66 Q26 36 50 20 Z;M70 20 Q94 36 90 66 Q88 98 60 96 Q32 98 32 66 Q30 30 70 20 Z;M60 16 Q90 34 90 66 Q90 96 60 98 Q30 96 30 66 Q30 34 60 16 Z"
        />
      </path>
      <Eye
        blink="4.4s"
        ex={60}
        ey={56}
        ink="oklch(30% 0.10 60)"
        max={3.2}
        r={8}
      />
      <path
        d="M48 76 Q54 72 60 76 Q66 80 72 76"
        fill="none"
        stroke="oklch(30% 0.10 55)"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
    </>
  );
}

function DomeBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.moss}>
        <animate
          attributeName="d"
          dur="3s"
          repeatCount="indefinite"
          values="M60 20 Q92 30 92 70 Q92 96 60 96 Q28 96 28 70 Q28 30 60 20 Z;M60 30 Q98 36 96 74 Q96 98 60 98 Q24 98 24 74 Q22 36 60 30 Z;M60 12 Q88 26 88 68 Q88 94 60 94 Q32 94 32 68 Q32 26 60 12 Z;M60 20 Q92 30 92 70 Q92 96 60 96 Q28 96 28 70 Q28 30 60 20 Z"
        />
      </path>
      <path
        d="M46 90 L46 80 M60 92 L60 82 M74 90 L74 80"
        opacity="0.5"
        stroke="oklch(28% 0.10 155)"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="60" cy="6" fill={ENGENTY_FILL.moss} r="3">
        <animate
          attributeName="cy"
          dur="3s"
          repeatCount="indefinite"
          values="8;3;8"
        />
      </circle>
      <Eye
        blink="4.6s"
        ex={60}
        ey={54}
        ink="oklch(16% 0.08 160)"
        max={3.4}
        r={8.5}
      />
    </>
  );
}

function FlameBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.rose}>
        <animate
          attributeName="d"
          dur="2.6s"
          repeatCount="indefinite"
          values="M60 14 Q84 44 80 76 Q78 98 60 98 Q42 98 40 76 Q36 44 60 14 Z;M52 18 Q86 40 82 76 Q80 98 60 98 Q40 98 38 76 Q32 46 52 18 Z;M68 18 Q88 46 82 76 Q80 98 60 98 Q40 98 38 76 Q34 40 68 18 Z;M60 14 Q84 44 80 76 Q78 98 60 98 Q42 98 40 76 Q36 44 60 14 Z"
        />
      </path>
      <path
        d="M40 20 Q60 6 80 20"
        fill="none"
        opacity="0.55"
        stroke={ENGENTY_FILL.rose}
        strokeLinecap="round"
        strokeWidth="3"
      >
        <animate
          attributeName="opacity"
          dur="2.6s"
          repeatCount="indefinite"
          values="0.55;0.15;0.55"
        />
      </path>
      <Eye
        blink="3.8s"
        ex={60}
        ey={62}
        ink="oklch(22% 0.10 18)"
        max={3.2}
        r={8}
      />
      <circle cx="60" cy="82" fill="oklch(22% 0.10 18)" r="2.6" />
    </>
  );
}

function OvalBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.ember}>
        <animate
          attributeName="d"
          dur="4s"
          repeatCount="indefinite"
          values="M60 34 Q100 38 100 64 Q100 92 60 94 Q20 92 20 64 Q20 38 60 34 Z;M60 40 Q110 40 108 66 Q108 96 60 96 Q12 96 12 66 Q10 40 60 40 Z;M60 28 Q92 36 92 62 Q92 88 60 90 Q28 88 28 62 Q28 36 60 28 Z;M60 34 Q100 38 100 64 Q100 92 60 94 Q20 92 20 64 Q20 38 60 34 Z"
        />
      </path>
      <g
        fill="none"
        opacity="0.45"
        stroke="oklch(40% 0.16 30)"
        strokeWidth="2.2"
      >
        <path d="M28 54 Q60 48 92 54">
          <animate
            attributeName="d"
            dur="4s"
            repeatCount="indefinite"
            values="M28 54 Q60 48 92 54;M20 56 Q60 50 100 56;M32 52 Q60 46 88 52;M28 54 Q60 48 92 54"
          />
        </path>
        <path d="M26 70 Q60 64 94 70">
          <animate
            attributeName="d"
            dur="4s"
            repeatCount="indefinite"
            values="M26 70 Q60 64 94 70;M18 72 Q60 66 102 72;M30 68 Q60 62 90 68;M26 70 Q60 64 94 70"
          />
        </path>
      </g>
      <Eye
        blink="4.2s"
        ex={66}
        ey={58}
        ink="oklch(24% 0.10 30)"
        max={3.2}
        r={8}
      />
    </>
  );
}

function BeanBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.teal}>
        <animate
          attributeName="d"
          dur="3.8s"
          repeatCount="indefinite"
          values="M48 96 Q24 92 26 68 Q28 44 52 38 Q78 32 88 50 Q98 66 84 84 Q70 100 48 96 Z;M46 98 Q20 92 24 66 Q28 40 54 36 Q80 30 90 50 Q100 68 84 86 Q68 102 46 98 Z;M50 94 Q28 90 28 68 Q30 46 52 40 Q76 34 86 50 Q94 64 82 82 Q72 98 50 94 Z;M48 96 Q24 92 26 68 Q28 44 52 38 Q78 32 88 50 Q98 66 84 84 Q70 100 48 96 Z"
        />
      </path>
      <circle cx="32" cy="94" fill={ENGENTY_FILL.teal} opacity="0.4" r="4">
        <animate
          attributeName="cx"
          dur="3.8s"
          repeatCount="indefinite"
          values="32;27;32"
        />
      </circle>
      <Eye
        blink="4.8s"
        ex={70}
        ey={58}
        ink="oklch(18% 0.08 200)"
        max={3.4}
        r={8}
      />
    </>
  );
}

function PebbleBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.slate}>
        <animate
          attributeName="d"
          dur="4.6s"
          repeatCount="indefinite"
          values="M60 96 Q20 96 18 78 Q16 60 46 56 Q78 52 98 62 Q110 72 104 86 Q98 96 60 96 Z;M60 98 Q14 98 14 78 Q14 58 46 54 Q80 50 102 62 Q114 74 106 88 Q98 98 60 98 Z;M60 94 Q26 94 22 78 Q20 62 46 58 Q76 54 94 62 Q106 70 100 84 Q94 94 60 94 Z;M60 96 Q20 96 18 78 Q16 60 46 56 Q78 52 98 62 Q110 72 104 86 Q98 96 60 96 Z"
        />
      </path>
      <g fill="oklch(30% 0.05 244)" opacity="0.32">
        <circle cx="42" cy="76" r="3" />
        <circle cx="56" cy="86" r="2.2" />
        <circle cx="86" cy="80" r="2.6" />
      </g>
      <Eye
        blink="5.6s"
        ex={68}
        ey={72}
        ink="oklch(20% 0.06 244)"
        max={3}
        r={7.5}
      />
    </>
  );
}

function SproutBody() {
  return (
    <>
      <g fill={ENGENTY_FILL.citron}>
        <ellipse cx="48" cy="34" rx="6" ry="10">
          <animate
            attributeName="cy"
            dur="3.2s"
            repeatCount="indefinite"
            values="34;30;34"
          />
        </ellipse>
        <ellipse cx="72" cy="32" rx="5.5" ry="9">
          <animate
            attributeName="cy"
            begin="0.5s"
            dur="3.2s"
            repeatCount="indefinite"
            values="32;28;32"
          />
        </ellipse>
      </g>
      <path fill={ENGENTY_FILL.citron}>
        <animate
          attributeName="d"
          dur="3.2s"
          repeatCount="indefinite"
          values="M60 100 Q28 98 28 72 Q28 46 60 44 Q92 46 92 72 Q92 98 60 100 Z;M60 102 Q24 100 24 72 Q24 42 60 40 Q96 42 96 72 Q96 100 60 102 Z;M60 98 Q32 96 32 72 Q32 50 60 48 Q88 50 88 72 Q88 96 60 98 Z;M60 100 Q28 98 28 72 Q28 46 60 44 Q92 46 92 72 Q92 98 60 100 Z"
        />
      </path>
      <Eye
        blink="4.2s"
        ex={60}
        ey={68}
        ink="oklch(24% 0.09 108)"
        max={3.4}
        r={8.5}
      />
    </>
  );
}

function TowerBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.violet}>
        <animate
          attributeName="d"
          dur="4s"
          repeatCount="indefinite"
          values="M60 102 Q36 100 38 78 Q40 58 42 44 Q44 26 60 24 Q76 26 78 44 Q80 58 82 78 Q84 100 60 102 Z;M60 104 Q32 102 36 78 Q40 56 40 42 Q40 22 60 20 Q80 22 80 42 Q80 56 84 78 Q88 102 60 104 Z;M60 100 Q40 98 40 78 Q42 60 44 46 Q46 30 60 28 Q74 30 76 46 Q78 60 80 78 Q80 98 60 100 Z;M60 102 Q36 100 38 78 Q40 58 42 44 Q44 26 60 24 Q76 26 78 44 Q80 58 82 78 Q84 100 60 102 Z"
        />
      </path>
      <g
        fill="none"
        opacity="0.4"
        stroke="oklch(28% 0.10 308)"
        strokeLinecap="round"
        strokeWidth="2.2"
      >
        <path d="M42 74 Q60 70 78 74" />
        <path d="M40 88 Q60 84 80 88" />
      </g>
      <Eye
        blink="5s"
        ex={60}
        ey={52}
        ink="oklch(20% 0.09 308)"
        max={3.2}
        r={8}
      />
    </>
  );
}

function WedgeBody() {
  return (
    <>
      <path fill={ENGENTY_FILL.magenta}>
        <animate
          attributeName="d"
          dur="2.9s"
          repeatCount="indefinite"
          values="M60 30 Q74 40 86 70 Q96 92 78 98 Q60 102 42 98 Q24 92 34 70 Q46 40 60 30 Z;M60 24 Q78 38 90 70 Q100 94 78 100 Q60 104 42 100 Q20 94 30 70 Q42 38 60 24 Z;M60 34 Q72 44 82 70 Q92 90 76 96 Q60 100 44 96 Q28 90 38 70 Q48 44 60 34 Z;M60 30 Q74 40 86 70 Q96 92 78 98 Q60 102 42 98 Q24 92 34 70 Q46 40 60 30 Z"
        />
      </path>
      <path
        d="M52 22 Q60 14 68 22"
        fill="none"
        opacity="0.5"
        stroke={ENGENTY_FILL.magenta}
        strokeLinecap="round"
        strokeWidth="3"
      >
        <animate
          attributeName="opacity"
          dur="2.9s"
          repeatCount="indefinite"
          values="0.5;0.12;0.5"
        />
      </path>
      <Eye
        blink="3.6s"
        ex={60}
        ey={70}
        ink="oklch(22% 0.10 345)"
        max={3.2}
        r={8}
      />
    </>
  );
}

const EYE_BY_KIND: Record<
  EngentyKind,
  { ex: number; ey: number; max: number }
> = {
  round: { ex: 68, ey: 58, max: 3.4 },
  drop: { ex: 60, ey: 56, max: 3.2 },
  dome: { ex: 60, ey: 54, max: 3.4 },
  flame: { ex: 60, ey: 62, max: 3.2 },
  oval: { ex: 66, ey: 58, max: 3.2 },
  bean: { ex: 70, ey: 58, max: 3.4 },
  pebble: { ex: 68, ey: 72, max: 3 },
  sprout: { ex: 60, ey: 68, max: 3.4 },
  tower: { ex: 60, ey: 52, max: 3.2 },
  wedge: { ex: 60, ey: 70, max: 3.2 },
};

/**
 * Ground contact per kind: `cy` is the line the body stands on in the shared
 * 0..120 space, so callers that sit a mark on something (the landing's
 * `HeadlinePerch`) can line the feet up with it.
 */
export const ENGENTY_SHADOW: Record<
  EngentyKind,
  { cy: number; rx: number; dur: string }
> = {
  round: { cy: 108, rx: 26, dur: "3.6s" },
  drop: { cy: 106, rx: 24, dur: "4.4s" },
  dome: { cy: 104, rx: 27, dur: "3s" },
  flame: { cy: 106, rx: 22, dur: "2.6s" },
  oval: { cy: 102, rx: 32, dur: "4s" },
  bean: { cy: 102, rx: 26, dur: "3.8s" },
  pebble: { cy: 102, rx: 34, dur: "4.6s" },
  sprout: { cy: 106, rx: 26, dur: "3.2s" },
  tower: { cy: 108, rx: 20, dur: "4s" },
  wedge: { cy: 106, rx: 28, dur: "2.9s" },
};

function Body({ kind }: { kind: EngentyKind }) {
  switch (kind) {
    case "drop":
      return <DropBody />;
    case "dome":
      return <DomeBody />;
    case "flame":
      return <FlameBody />;
    case "oval":
      return <OvalBody />;
    case "bean":
      return <BeanBody />;
    case "pebble":
      return <PebbleBody />;
    case "sprout":
      return <SproutBody />;
    case "tower":
      return <TowerBody />;
    case "wedge":
      return <WedgeBody />;
    default:
      return <RoundBody />;
  }
}

/** Flat landing engenty — SMIL idle morph + pointer-following eye/body. */
export function Engenty({
  animated = true,
  kind = "round",
  size = 160,
  className,
}: EngentyProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eye = EYE_BY_KIND[kind];
  const shadow = ENGENTY_SHADOW[kind];
  useEngentyGaze(svgRef, eye, animated);

  // SMIL is not CSS — pause/unpause the SVG timeline when the row is idle.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animated && !reduced) {
      svg.unpauseAnimations();
      return;
    }
    svg.pauseAnimations();
    svg.setCurrentTime(0);
  }, [animated]);

  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      overflow="visible"
      ref={svgRef}
      style={{ display: "block" }}
      viewBox="0 0 120 120"
      width={size}
    >
      <ellipse
        className="e-shadow"
        cx="60"
        cy={shadow.cy}
        fill="#000"
        opacity="0.14"
        rx={shadow.rx}
        ry="4.5"
      >
        <animate
          attributeName="rx"
          dur={shadow.dur}
          repeatCount="indefinite"
          values={`${shadow.rx};${shadow.rx * 0.8};${shadow.rx}`}
        />
      </ellipse>
      <g className="e-lean">
        <Body kind={kind} />
      </g>
    </svg>
  );
}
