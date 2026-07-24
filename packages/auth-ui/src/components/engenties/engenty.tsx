"use client";

import { useRef } from "react";
import { ENGENTY_FILL, type EngentyKind } from "./colors";
import { useEngentyGaze } from "./use-engenty-gaze";

export interface EngentyProps {
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

const EYE_BY_KIND: Record<
  EngentyKind,
  { ex: number; ey: number; max: number }
> = {
  round: { ex: 68, ey: 58, max: 3.4 },
  drop: { ex: 60, ey: 56, max: 3.2 },
  dome: { ex: 60, ey: 54, max: 3.4 },
  flame: { ex: 60, ey: 62, max: 3.2 },
  oval: { ex: 66, ey: 58, max: 3.2 },
};

const SHADOW: Record<EngentyKind, { cy: number; rx: number; dur: string }> = {
  round: { cy: 108, rx: 26, dur: "3.6s" },
  drop: { cy: 106, rx: 24, dur: "4.4s" },
  dome: { cy: 104, rx: 27, dur: "3s" },
  flame: { cy: 106, rx: 22, dur: "2.6s" },
  oval: { cy: 102, rx: 32, dur: "4s" },
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
    default:
      return <RoundBody />;
  }
}

/** Flat landing engenty — SMIL idle morph + pointer-following eye/body. */
export function Engenty({
  kind = "round",
  size = 160,
  className,
}: EngentyProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eye = EYE_BY_KIND[kind];
  const shadow = SHADOW[kind];
  useEngentyGaze(svgRef, eye);

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
