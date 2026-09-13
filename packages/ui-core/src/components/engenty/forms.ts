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

/**
 * The small marks the flat SVG draws besides body and eye — the drop's mouth,
 * the round's bubbles, the dome's legs and antenna, the oval's stripes. The
 * shaders draw them as decals so the 3D coats stay the same characters.
 * Coordinates are the SVG's, in the shared 0..120 space.
 */
export type EngentyExtra =
  | { type: "ink-dot"; x: number; y: number; r: number; alpha?: number }
  | {
      type: "body-dot";
      x: number;
      y: number;
      r: number;
      alpha?: number;
      /** Vertical bob amplitude, like the SVG's animated bubbles. */
      bob?: number;
    }
  | {
      type: "arc";
      cx: number;
      cy: number;
      r: number;
      /** Half-span in degrees, measured from straight up. */
      half: number;
      width: number;
      alpha?: number;
      /** Stroke in the body colour (halo) instead of ink (stripes). */
      body?: boolean;
    }
  | {
      type: "bar";
      x: number;
      y: number;
      /** Half-length of a vertical stroke. */
      half: number;
      width: number;
      alpha?: number;
    }
  | {
      type: "wave";
      x: number;
      y: number;
      len: number;
      amp: number;
      width: number;
      alpha?: number;
    };

export interface EngentyForm {
  /** Metaballs unioned with a smooth minimum. */
  blobs: FormBlob[];
  /** Decals besides body and eye; see `EngentyExtra`. */
  extras?: EngentyExtra[];
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
    extras: [
      { type: "body-dot", x: 97, y: 34, r: 6, alpha: 0.5, bob: 3 },
      { type: "body-dot", x: 106, y: 24, r: 3.5, alpha: 0.35, bob: 3.5 },
    ],
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
    extras: [{ type: "wave", x: 48, y: 76, len: 24, amp: 2, width: 2.6 }],
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
    extras: [
      { type: "bar", x: 46, y: 85, half: 5, width: 2.4, alpha: 0.5 },
      { type: "bar", x: 60, y: 87, half: 5, width: 2.4, alpha: 0.5 },
      { type: "bar", x: 74, y: 85, half: 5, width: 2.4, alpha: 0.5 },
      { type: "body-dot", x: 60, y: 6, r: 3, bob: 2.5 },
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
    extras: [
      {
        type: "arc",
        cx: 60,
        cy: 45,
        r: 32,
        half: 39,
        width: 3,
        alpha: 0.55,
        body: true,
      },
      { type: "ink-dot", x: 60, y: 82, r: 2.6 },
    ],
    falloff: 1.6,
    fur: 7.5,
    period: 2.6,
    eye: { x: 60, y: 62, r: 8 },
    shadowRx: 22,
  },
  oval: {
    blobs: [{ x: 60, y: 64, r: 40, rx: 1.06, ry: 0.76 }],
    extras: [
      {
        type: "arc",
        cx: 60,
        cy: 223,
        r: 172,
        half: 10.7,
        width: 2.2,
        alpha: 0.45,
      },
      {
        type: "arc",
        cx: 60,
        cy: 261,
        r: 191,
        half: 10.3,
        width: 2.2,
        alpha: 0.45,
      },
    ],
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
    extras: [{ type: "body-dot", x: 32, y: 94, r: 4, alpha: 0.4 }],
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
    extras: [
      { type: "ink-dot", x: 42, y: 76, r: 3, alpha: 0.32 },
      { type: "ink-dot", x: 56, y: 86, r: 2.2, alpha: 0.32 },
      { type: "ink-dot", x: 86, y: 80, r: 2.6, alpha: 0.32 },
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
    extras: [
      { type: "arc", cx: 60, cy: 154, r: 80, half: 13, width: 2.2, alpha: 0.4 },
      {
        type: "arc",
        cx: 60,
        cy: 187,
        r: 99,
        half: 11.7,
        width: 2.2,
        alpha: 0.4,
      },
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
    extras: [
      {
        type: "arc",
        cx: 60,
        cy: 28,
        r: 10,
        half: 53,
        width: 3,
        alpha: 0.5,
        body: true,
      },
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

/** Longest extras list across all kinds — the shader's fixed loop bound. */
export const MAX_FORM_EXTRAS = Math.max(
  ...Object.values(ENGENTY_FORMS).map((f) => f.extras?.length ?? 0)
);

const EXTRA_KIND = {
  "ink-dot": 1,
  "body-dot": 2,
  arc: 3,
  bar: 4,
  wave: 5,
} as const;

/**
 * Flattens a form's extras to two `vec4[]` uniforms: geometry
 * `(x, y, a, b)` and meta `(kind, alpha, width, flag)`. Unused slots carry
 * kind 0, which the shader skips.
 */
export function packFormExtras(form: EngentyForm): {
  geometry: Float32Array;
  meta: Float32Array;
} {
  const geometry = new Float32Array(MAX_FORM_EXTRAS * 4);
  const meta = new Float32Array(MAX_FORM_EXTRAS * 4);
  form.extras?.forEach((extra, i) => {
    const g = i * 4;
    meta[g] = EXTRA_KIND[extra.type];
    meta[g + 1] = extra.alpha ?? 1;
    switch (extra.type) {
      case "ink-dot":
        geometry.set([extra.x, extra.y, extra.r, 0], g);
        break;
      case "body-dot":
        geometry.set([extra.x, extra.y, extra.r, extra.bob ?? 0], g);
        break;
      case "arc":
        geometry.set(
          [extra.cx, extra.cy, extra.r, (extra.half * Math.PI) / 180],
          g
        );
        meta[g + 2] = extra.width;
        meta[g + 3] = extra.body ? 1 : 0;
        break;
      case "bar":
        geometry.set([extra.x, extra.y, extra.half, 0], g);
        meta[g + 2] = extra.width;
        break;
      case "wave":
        geometry.set([extra.x, extra.y, extra.len, extra.amp], g);
        meta[g + 2] = extra.width;
        break;
      default:
        break;
    }
  });
  return { geometry, meta };
}
