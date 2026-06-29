"use client";

import { useRef } from "react";
import { usePupilMouseFollow } from "./use-pupil-mouse-follow";

const blobEyeStyles = `
/* Transform-only wobble (GPU-composited — cheap). Silhouette is a static
   border-radius per character; changing character morphs via transition. */
@keyframes blob-wobble {
  0%, 100% { transform: scaleX(1) scaleY(1) rotate(0deg); }
  25% { transform: scaleX(1.06) scaleY(0.94) rotate(-1.5deg); }
  50% { transform: scaleX(0.96) scaleY(1.04) rotate(0.5deg); }
  75% { transform: scaleX(1.04) scaleY(0.95) rotate(1.5deg); }
}
@keyframes blob-eye-drift {
  0%, 18%, 100% { transform: translate(0, 0); }
  24%, 38% { transform: translate(2.2px, -1.4px); }
  44%, 60% { transform: translate(-2px, 1px); }
  66%, 82% { transform: translate(1.2px, 1.8px); }
  88% { transform: translate(-1px, -1.6px); }
}
@keyframes blob-eye-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.35); }
}
@keyframes blob-eye-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.08); }
}
.blob-shape {
  animation: blob-wobble 6s ease-in-out infinite;
  transition:
    opacity 200ms ease-out,
    scale 300ms cubic-bezier(0.34, 1.4, 0.64, 1),
    border-radius 900ms ease-in-out,
    background-color 900ms ease-in-out;
  border-radius: 48% 52% 34% 36% / 72% 70% 30% 32%;
}
.blob-shape:hover { filter: brightness(0.92); }
.blob-shape[aria-pressed="true"] { animation-duration: 2.4s; }
/* Character silhouettes + colors (Familiars-inspired) — cycled via data-character.
   --blob-accent tints that character's accessory (bubbles, rays, waves). */
.blob-shape { --blob-accent: var(--ember); }
.blob-shape[data-character="1"] { border-radius: 50%; background-color: #3358d4; --blob-accent: #3358d4; }
.blob-shape[data-character="2"] { border-radius: 50% 50% 48% 48% / 70% 70% 30% 30%; background-color: #e08c0b; --blob-accent: #e08c0b; }
.blob-shape[data-character="3"] { border-radius: 54% 46% 48% 52% / 88% 86% 14% 12%; background-color: #1e7d49; --blob-accent: #1e7d49; }
.blob-shape[data-character="4"] { border-radius: 48% 52% 50% 50% / 38% 36% 64% 62%; background-color: #d23b5e; --blob-accent: #d23b5e; }
.blob-eye-lid { animation: blob-eye-blink 6s ease-in-out infinite; transform-origin: center; }
.blob-eye-pupil { animation: blob-eye-drift 9s ease-in-out infinite; }
.blob-eye-pupil[data-active="true"] {
  animation: blob-eye-pulse 1.6s ease-in-out infinite;
}
/* Card that tints its border/shadow to the avatar color while focused.
   Pill shape + a touch more vertical padding (compact one-row dock). */
.blob-tinted-card {
  transition: border-color 300ms ease-out, box-shadow 300ms ease-out;
  /* Fixed radius: pill at one-row height, corners stay put when it grows. */
  border-radius: 1.7rem;
  padding: 0.7rem 1rem;
}
.blob-tinted-card:focus-within {
  border-color: color-mix(in oklch, var(--blob-accent, var(--ember)) 60%, transparent);
  box-shadow: 0 10px 28px -10px color-mix(in oklch, var(--blob-accent, var(--ember)) 50%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .blob-shape,
  .blob-eye-lid,
  .blob-eye-pupil { animation: none; }
}
`;

export interface BlobEyeProps {
  isActive: boolean;
  /** Tailwind size class for the eye SVG (default fits the 60px FAB). */
  sizeClassName?: string;
}

/** Abstracted blob eye: stroked ring + pupil that drifts, blinks, and
 *  follows the cursor / text caret (see usePupilMouseFollow). */
export function BlobEye({
  isActive,
  sizeClassName = "size-7.5",
}: BlobEyeProps) {
  const pupilRef = useRef<SVGGElement>(null);
  usePupilMouseFollow(pupilRef);
  return (
    <>
      <style>{blobEyeStyles}</style>
      <svg
        aria-hidden="true"
        className={`${sizeClassName} shrink-0`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <g className="blob-eye-lid">
          <circle
            cx="12"
            cy="11"
            r="5.2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <g className="blob-eye-pupil" data-active={isActive} ref={pupilRef}>
            <circle cx="12" cy="11" fill="currentColor" r="2.2" />
          </g>
        </g>
      </svg>
    </>
  );
}
