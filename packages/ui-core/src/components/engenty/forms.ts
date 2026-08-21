/**
 * Procedural body descriptions for the five engenty silhouettes.
 *
 * The flat SVG engenties (`engenty.tsx`) draw hand-authored bezier paths. The
 * fluffy renderer (`fluffy-engenty.tsx`) cannot use those paths — it needs a
 * a field, not an outline, so it can push fur outward along the surface normal
 * and inflate the 2D silhouette into a 2.5D height map.
 *
 * So each kind is also expressed here as a small blend of metaballs in the same
 * 0..120 coordinate space the SVG uses. `smin` over the blobs reproduces the
 * hand-drawn shape closely enough that the two renderers read as the same
 * character, while giving the shader a cheap analytic SDF with a well-defined
 * gradient everywhere.
 */

import type { EngentyKind } from "./colors";

export interface FormBlob {
  /** Radius; the x radius when `rx` scales it. */
  r: number;
  /** Horizontal stretch (1 = circular). */
  rx?: number;
  /** Vertical stretch (1 = circular). */
  ry?: number;
  /** Centre in the shared 0..120 viewBox space. */
  x: number;
  y: number;
}

export interface EngentyForm {
  /** Metaballs unioned with a smooth minimum. */
  blobs: FormBlob[];
  /** Eye anchor, shared with the flat renderer's `EYE_BY_KIND`. */
  eye: { x: number; y: number; r: number };
  /**
   * Metaball falloff exponent (see `bodyK` in the shader). Lower melts the
   * blobs further into one another; higher keeps them distinct. Has no effect
   * on a single-blob form, whose outline is exact at any value.
   */
  falloff: number;
  /** Fur length in viewBox units at the silhouette edge. */
  fur: number;
  /** Idle morph period in seconds; matches the flat SVG's SMIL `dur`. */
  period: number;
  /** Ground shadow width. */
  shadowRx: number;
}

export const ENGENTY_FORMS: Record<EngentyKind, EngentyForm> = {
  round: {
    blobs: [{ x: 60, y: 61, r: 36, rx: 1, ry: 1.06 }],
    falloff: 2.2,
    fur: 9,
    period: 3.6,
    eye: { x: 68, y: 58, r: 8 },
    shadowRx: 26,
  },
  drop: {
    blobs: [
      { x: 60, y: 70, r: 30, rx: 1, ry: 0.95 },
      { x: 60, y: 40, r: 20, rx: 0.85, ry: 1.15 },
      { x: 60, y: 22, r: 9, rx: 0.7, ry: 1 },
    ],
    falloff: 1.7,
    fur: 8.5,
    period: 4.4,
    eye: { x: 60, y: 56, r: 8 },
    shadowRx: 24,
  },
  dome: {
    blobs: [
      { x: 60, y: 72, r: 32, rx: 1.02, ry: 0.82 },
      { x: 60, y: 46, r: 28, rx: 1, ry: 1 },
    ],
    falloff: 1.7,
    fur: 9,
    period: 3,
    eye: { x: 60, y: 54, r: 8.5 },
    shadowRx: 27,
  },
  flame: {
    blobs: [
      { x: 60, y: 80, r: 22, rx: 1, ry: 0.95 },
      { x: 60, y: 54, r: 19, rx: 0.95, ry: 1.1 },
      { x: 60, y: 30, r: 12, rx: 0.72, ry: 1.25 },
      { x: 60, y: 16, r: 5, rx: 0.6, ry: 1.1 },
    ],
    falloff: 1.6,
    fur: 7.5,
    period: 2.6,
    eye: { x: 60, y: 62, r: 8 },
    shadowRx: 22,
  },
  oval: {
    blobs: [{ x: 60, y: 64, r: 40, rx: 1.06, ry: 0.76 }],
    falloff: 2.2,
    fur: 10,
    period: 4,
    eye: { x: 66, y: 58, r: 8 },
    shadowRx: 32,
  },
  bean: {
    // Two lobes offset on a diagonal: the union leans, which reads as a body
    // caught mid-turn rather than a shape sitting still.
    blobs: [
      { x: 46, y: 76, r: 24 },
      { x: 74, y: 54, r: 22 },
    ],
    falloff: 1.7,
    fur: 9,
    period: 3.8,
    eye: { x: 70, y: 58, r: 8 },
    shadowRx: 26,
  },
  pebble: {
    blobs: [
      { x: 56, y: 76, r: 32, rx: 1.3, ry: 0.66 },
      { x: 86, y: 74, r: 18, rx: 1, ry: 0.7 },
    ],
    falloff: 1.8,
    fur: 9.5,
    period: 4.6,
    eye: { x: 68, y: 72, r: 7.5 },
    shadowRx: 34,
  },
  sprout: {
    // The two small top blobs are the reason the field is a metaball sum: on a
    // min-union they would read as separate beads stuck to the head.
    blobs: [
      { x: 60, y: 74, r: 28 },
      { x: 48, y: 34, r: 8, rx: 0.75, ry: 1.15 },
      { x: 72, y: 32, r: 7, rx: 0.75, ry: 1.15 },
    ],
    falloff: 1.7,
    fur: 8.5,
    period: 3.2,
    eye: { x: 60, y: 68, r: 8.5 },
    shadowRx: 26,
  },
  tower: {
    blobs: [
      { x: 60, y: 86, r: 19 },
      { x: 60, y: 60, r: 17 },
      { x: 60, y: 36, r: 14 },
    ],
    falloff: 1.6,
    fur: 8,
    period: 4,
    eye: { x: 60, y: 52, r: 8 },
    shadowRx: 20,
  },
  wedge: {
    blobs: [
      { x: 44, y: 84, r: 20 },
      { x: 76, y: 84, r: 20 },
      { x: 60, y: 48, r: 14 },
    ],
    falloff: 1.7,
    fur: 8.5,
    period: 2.9,
    eye: { x: 60, y: 70, r: 8 },
    shadowRx: 28,
  },
};

/**
 * Reference radius for a form: the largest blob's smaller half-axis. The
 * normalised field is unitless, so this is what puts fur length, body
 * inflation and the reach cut-off back into form units.
 */
export function formScale(form: EngentyForm): number {
  return Math.max(
    ...form.blobs.map((b) => b.r * Math.min(b.rx ?? 1, b.ry ?? 1))
  );
}

/** Longest blob list across all kinds — the shader's fixed loop bound. */
export const MAX_FORM_BLOBS = Math.max(
  ...Object.values(ENGENTY_FORMS).map((f) => f.blobs.length)
);

/**
 * Flattens a form to the `vec4[]`-shaped uniform the fur shader expects:
 * `(x, y, radiusX, radiusY)` per blob, padded to `MAX_FORM_BLOBS` with
 * degenerate blobs (radius 0) that the smooth union ignores.
 */
export function packFormBlobs(form: EngentyForm): Float32Array {
  const packed = new Float32Array(MAX_FORM_BLOBS * 4);
  for (let i = 0; i < MAX_FORM_BLOBS; i++) {
    const blob = form.blobs[i];
    if (!blob) {
      // Radius 0 far outside the body: never wins the smooth union.
      packed[i * 4] = 1e4;
      packed[i * 4 + 1] = 1e4;
      packed[i * 4 + 2] = 0;
      packed[i * 4 + 3] = 0;
      continue;
    }
    packed[i * 4] = blob.x;
    packed[i * 4 + 1] = blob.y;
    packed[i * 4 + 2] = blob.r * (blob.rx ?? 1);
    packed[i * 4 + 3] = blob.r * (blob.ry ?? 1);
  }
  return packed;
}
