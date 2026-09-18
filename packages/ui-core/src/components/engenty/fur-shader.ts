/**
 * Shell-texturing fur, in 2.5D.
 *
 * The classic real-time fur technique renders N concentric "shells" offset
 * along a mesh's surface normal, each carrying a punched-out noise pattern; the
 * layers read as strands. We have no mesh — an engenty is a 2D silhouette — so
 * this does the same thing against an implicit surface instead:
 *
 *   1. `sdBody` is a smooth union of the kind's metaballs (see `forms.ts`),
 *      wobbling on the same period as the flat SVG's SMIL morph.
 *   2. That 2D field is inflated into a hemispherical height map, which gives a
 *      real 3D normal per pixel — so the fur has something to stand on and the
 *      lighting has something to shade.
 *   3. Rather than drawing shells outward, the fragment walks them *inward*:
 *      for shell `t` it asks "which point on the skin would have fur landing
 *      here?", tests the strand grid there, and takes the first (nearest) hit.
 *      Walking tip-to-root means the first hit is the front-most strand, so the
 *      layers composite correctly with one pass and no depth buffer.
 *
 * Everything is procedural — no textures, no geometry, no library.
 */

import { MAX_FORM_BLOBS, MAX_FORM_EXTRAS } from "./forms";

/** Padding around the 0..120 form space so fur can overhang the silhouette. */
export const FUR_VIEW = 152;
export const FUR_ORIGIN = -16;

/** Upper bound of the shell loop; `uShells` picks how many actually run. */
export const FUR_SHELL_MAX = 32;

export const FUR_VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Everything both coats share: uniforms, the metaball field, the inflated
 * normal, the eye anchor and the hash. A coat shader appends its own main.
 */
export const FUR_COMMON_GLSL = `#version 300 es
precision highp float;

#define BLOBS ${MAX_FORM_BLOBS}
#define EXTRAS ${MAX_FORM_EXTRAS}
#define SHELL_MAX ${FUR_SHELL_MAX}
#define VIEW ${FUR_VIEW.toFixed(1)}
#define ORIGIN ${FUR_ORIGIN.toFixed(1)}
#define TAU 6.2831853

out vec4 outColor;

uniform vec2  uResolution;
uniform float uTime;
uniform vec4  uBlobs[BLOBS];   // cx, cy, radiusX, radiusY
uniform float uFalloff;        // metaball falloff: lower melts blobs together
uniform float uScale;          // reference radius: turns the field into units
uniform float uFur;            // strand length, form units
uniform float uPeriod;         // idle morph period, seconds
uniform float uInflate;        // how far the silhouette bulges toward camera
uniform float uDensity;        // strand cells across the form
uniform float uThick;          // strand radius within its cell
uniform int   uShells;
uniform vec2  uLean;           // pointer-driven body lean
uniform vec3  uLight;
uniform vec3  uBody;
uniform vec3  uDeep;           // root / self-shadow color
uniform vec3  uTip;            // backlit rim color
uniform vec3  uEye;            // x, y, radius — fur parts around it
uniform float uWind;
uniform vec2  uGaze;            // -1..1 pointer direction for the pupil
uniform vec4  uExtras[EXTRAS];     // decal geometry (x, y, a, b)
uniform vec4  uExtraMeta[EXTRAS];  // decal meta (kind, alpha, width, flag)
uniform vec2  uWobble;             // spring overshoot past the lean (jelly)
uniform float uClarity;            // jelly: 1 = clear gel, 0 = opaque paint

// ─── field ───────────────────────────────────────────────────────────────────

/**
 * Idle drift of one blob: a sway the whole body shares, plus a small amount of
 * its own.
 *
 * Fully independent per-blob drift is what produced the creases in the pear
 * shapes. A small blob wandering on its own phase pulls partly off the one it
 * sits on, the smooth union necks in behind it, and the coat parts along that
 * concave seam and shows the dark skin underneath. Keeping most of the motion
 * shared preserves the roll while holding the body together.
 *
 * The eye rides this same displacement, which is what keeps it locked to the
 * body as the silhouette moves.
 */
vec2 blobDrift(float phase, float w) {
  vec2 shared = vec2(sin(w) * 1.5, cos(w * 0.8) * 1.1);
  vec2 own = vec2(sin(w + phase) * 0.4, cos(w * 0.8 + phase) * 0.3);
  return shared + own;
}

/** Lean falloff: the top of the body swings further than the base. */
vec2 blobLean(float y) {
  return uLean * (1.15 - y / 120.0);
}

/**
 * Interior coordinate: 0 at a blob's centre, 1 on the outline, greater outside.
 *
 * This is a metaball field — a *sum* of per-blob falloffs — and the sum is the
 * whole point. Two earlier operators both failed on bodies built from blobs of
 * different sizes: smooth-min of distance fields weights each blob by its own
 * radius, so a small blob meeting a large one creases, and the coat parts along
 * that concave valley (the folds on the pear shapes); smooth-min of
 * *normalised* fields is scale-free but still a min, so every small blob
 * asserts its own outline and the body reads as a string of lumps. A sum can do
 * neither: overlapping influence always adds, so seams swell the way a real
 * body does, and a small blob contributes a bulge rather than a silhouette.
 *
 * The exponent is inverted at the end so a lone blob returns exactly the
 * normalised radius it would have on its own — single-blob forms are therefore
 * untouched by any of this, whatever uFalloff is set to.
 */
float bodyK(vec2 p) {
  float w = TAU * uTime / uPeriod;
  float f = 0.0;
  for (int i = 0; i < BLOBS; i++) {
    vec4 b = uBlobs[i];
    if (b.z <= 0.0) { continue; }
    float ph = float(i) * 1.7;
    // Blobs drift and squash so the silhouette never simply scales — it rolls,
    // the way the SVG morph does.
    vec2 c = b.xy + blobDrift(ph, w) + blobLean(b.y);
    vec2 r = b.zw * (1.0 + 0.03 * sin(w + ph * 0.6));
    r.x *= 1.0 + 0.035 * sin(w * 1.1);
    r.y *= 1.0 - 0.035 * sin(w * 1.1);
    vec2 q = (p - c) / r;
    f += exp(-uFalloff * dot(q, q));
  }
  return sqrt(max(0.0, -log(max(f, 1e-8)) / uFalloff));
}

/** The same field in form units, for the reach and depth maths downstream. */
float sdBody(vec2 p) {
  return (bodyK(p) - 1.0) * uScale;
}

/**
 * Surface at \`p\`: signed distance, plus the normal of the inflated body.
 * \`k\` runs 1 at the silhouette edge to 0 at the centre, so the normal sweeps
 * from fully sideways (fur sticks out past the outline) to facing the camera.
 */
vec3 surfaceNormal(vec2 p, float d) {
  float e = 0.7;
  vec2 grad = vec2(sdBody(p + vec2(e, 0.0)) - d, sdBody(p + vec2(0.0, e)) - d);
  float len = length(grad);
  vec2 dir = len > 1e-5 ? grad / len : vec2(0.0, -1.0);
  float k = 1.0 - clamp(-d / uInflate, 0.0, 1.0);
  return vec3(dir * k, sqrt(max(0.0, 1.0 - k * k)));
}

// ─── strands ─────────────────────────────────────────────────────────────────

/**
 * Eye centre on the *deformed* body. Applying only the lean would leave the eye
 * hanging still while the silhouette rolls underneath it; instead the blob
 * drifts are blended by proximity, so the eye rides the part of the body it
 * actually sits on — the head blob on a drop or flame, the single blob on a
 * round.
 */
vec2 eyeCentre() {
  float w = TAU * uTime / uPeriod;
  vec2 drift = vec2(0.0);
  float total = 0.0;
  for (int i = 0; i < BLOBS; i++) {
    vec4 b = uBlobs[i];
    if (b.z <= 0.0) { continue; }
    vec2 away = uEye.xy - b.xy;
    float weight = 1.0 / (1.0 + dot(away, away) / (b.z * b.z));
    drift += weight * blobDrift(float(i) * 1.7, w);
    total += weight;
  }
  if (total > 0.0) {
    drift /= total;
  }
  return uEye.xy + drift + blobLean(uEye.y);
}

// ─── extras: the flat mark's mouth, bubbles, legs, stripes ──────────────────

/** Arc centred at the origin, opening upward (−y), spanning ±half from up. */
float sdArc(vec2 q, float r, float span) {
  float ang = clamp(atan(q.x, -q.y), -span, span);
  return length(q - vec2(sin(ang), -cos(ang)) * r);
}

/** Vertical stroke of half-length h through the origin. */
float sdBar(vec2 q, float h) {
  return length(vec2(q.x, max(abs(q.y) - h, 0.0)));
}

/** One up-then-down wave from the origin to (len, 0). */
float sdWave(vec2 q, float len, float amp) {
  float x = clamp(q.x, 0.0, len);
  float y = -amp * sin(TAU * x / len);
  return length(q - vec2(x, y));
}

/**
 * Premultiplied colour of every decal at \`p\`. Decals ride the same drift and
 * lean as the body, so the mouth stays under the eye while the body rolls.
 * Ink decals darken; body-coloured ones (bubbles, halo, antenna) are lit
 * discs and strokes in the coat colour that may sit outside the silhouette.
 */
vec4 extrasOver(vec2 p, vec3 ink, vec3 bodyCol, float aa) {
  vec4 acc = vec4(0.0);
  float w = TAU * uTime / uPeriod;
  vec2 drift = eyeCentre() - uEye.xy - blobLean(uEye.y);
  for (int i = 0; i < EXTRAS; i++) {
    vec4 m = uExtraMeta[i];
    int kind = int(m.x + 0.5);
    if (kind == 0) { continue; }
    vec4 g = uExtras[i];
    vec2 c = g.xy + drift + blobLean(g.y);
    vec2 q = p - c;
    float cov = 0.0;
    vec3 col = ink;
    float hw = m.z * 0.5;
    if (kind == 1) {
      cov = 1.0 - smoothstep(-aa, aa, length(q) - g.z);
    } else if (kind == 2) {
      q.y += sin(w + g.x * 0.1) * g.w;
      float d = length(q) - g.z;
      cov = 1.0 - smoothstep(-aa, aa, d);
      // A small lit sphere: brighter toward the light, a rim at the edge.
      float lit = 0.75 + 0.35 * clamp(-(q.x + q.y) / max(g.z, 1e-3), -1.0, 1.0) * 0.5;
      col = mix(bodyCol * lit, vec3(1.0), 0.18 * smoothstep(-2.0, 0.0, d));
    } else if (kind == 3) {
      cov = 1.0 - smoothstep(hw - aa, hw + aa, sdArc(q, g.z, g.w));
      if (m.w > 0.5) { col = bodyCol; }
    } else if (kind == 4) {
      cov = 1.0 - smoothstep(hw - aa, hw + aa, sdBar(q, g.z));
    } else if (kind == 5) {
      cov = 1.0 - smoothstep(hw - aa, hw + aa, sdWave(q, g.z, g.w));
    }
    float a = cov * m.y;
    acc.rgb = acc.rgb * (1.0 - a) + col * a;
    acc.a = acc.a * (1.0 - a) + a;
  }
  return acc;
}

vec2 hash2(vec2 c) {
  vec3 p3 = fract(vec3(c.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

`;

/** Shell fur. */
export const FUR_FRAGMENT_SHADER = `${FUR_COMMON_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = vec2(uv.x, 1.0 - uv.y) * VIEW + ORIGIN;

  float d0 = sdBody(p);
  float aaPx = fwidth(p.x) * 0.75;
  vec3 ink = mix(uDeep, vec3(0.0), 0.45);
  vec4 extras = extrasOver(p, ink, uBody, aaPx);

  // Nothing reaches further out than one strand plus the gravity bend; bail
  // early so most of the canvas costs a single field evaluation. A decal
  // outside the coat (bubble, halo, antenna) still paints.
  if (d0 > uFur * 1.6 + 2.0) {
    outColor = extras;
    return;
  }

  vec3 n0 = surfaceNormal(p, d0);
  vec3 light = normalize(uLight);

  // How much of the strand grid one pixel spans. Derivatives must be taken
  // here, in uniform control flow: inside the shell loop the fragments of a
  // quad take different branches and fwidth is undefined there. Since p is
  // linear in gl_FragCoord this is a constant anyway.
  vec2 perPixel = fwidth(p);
  float radPerPixel = max(perPixel.x, perPixel.y) * uDensity / 120.0 * 2.0;

  // Strands are combed by gravity and a slow wind, more so toward the tip.
  float sway = sin(TAU * uTime / (uPeriod * 2.3)) * uWind;
  vec2 groom = vec2(sway, 0.42);

  // Distance between consecutive shells along a strand: in form units for the
  // gap-closing width below, and in strand-fraction for the tip fade.
  float shellT = 1.0 / float(max(uShells - 1, 1));
  float shellStep = uFur * shellT;

  vec4 acc = vec4(0.0);

  for (int i = SHELL_MAX - 1; i >= 0; i--) {
    if (i >= uShells) { continue; }
    float t = float(i) / float(max(uShells - 1, 1));
    float reach = t * uFur;

    // Walk back down this strand to where its root sits on the skin.
    vec2 q = p - n0.xy * reach - groom * reach * t;
    float dq = sdBody(q);
    if (dq > 0.0) { continue; }

    vec2 g = q * uDensity / 120.0;
    vec2 cell = floor(g);
    vec2 rnd = hash2(cell);

    // A narrow length spread, not a wide one: widely varying strands leave the
    // rim sparse and spiky, where a real coat has a fairly even depth with only
    // a few strays past it.
    float strand = 0.7 + 0.3 * rnd.x;
    // A real socket: strands are cut back inside the eye and ramp back to full
    // length just outside it, so the eye has somewhere to sit instead of being
    // laid on top of an unbroken coat.
    strand *= smoothstep(uEye.z * 1.15, uEye.z * 1.95, length(q - eyeCentre()));
    if (t > strand) { continue; }

    vec2 jitter = (hash2(cell + 7.13) - 0.5) * 0.72;
    float rad = length(fract(g) - 0.5 - jitter) * 2.0;
    float taper = 1.0 - t / max(strand, 1e-3);
    // Tips come to a point rather than stopping at a stub, so a strand ends by
    // fading out over its last pixel instead of vanishing at full width.
    float width = uThick * (0.1 + 0.9 * taper);

    // Shells sample a continuous strand at discrete points, and each sample is
    // drawn as a disc. Where the body's normal is near-sideways — the
    // silhouette — the gap between consecutive samples is at its widest, and a
    // disc narrower than that gap leaves the strand as a chain of beads rather
    // than a line. That is the blocky speckle along the tips, worst there
    // because the taper makes the discs smallest exactly where the gap is
    // largest. Widening to close the gap costs a slightly blunter tip and is
    // the right trade; more shells narrows the gap and sharpens it back.
    float spread = length(n0.xy + 2.0 * groom * t);
    float stepRad = shellStep * spread * uDensity / 120.0 * 2.0;

    // Antialias against the *pixel*, not the cell. A strand narrower than a
    // pixel is drawn a pixel wide and pays for it in opacity, rather than
    // flickering in and out as the sample point drifts across it — sub-pixel
    // strands at full opacity are exactly what makes the coat sparkle. The
    // gap-closing widening above takes no such penalty: that strand really is
    // solid, it was only undersampled.
    float drawn = max(max(width, radPerPixel), stepRad * 0.6);
    float fade = min(width / max(radPerPixel, 1e-4), 1.0);
    // A strand ends at a continuous length but is only sampled at shells, so
    // its last drawn sample snaps to a shell boundary — which is what makes the
    // outer fringe stair-step rather than taper. Fading the final sample out
    // over one shell puts the tip back where the strand actually ends.
    float tipFade = smoothstep(strand, strand - shellT, t);
    float cover =
      smoothstep(drawn + radPerPixel, max(drawn - radPerPixel, 0.0), rad) *
      fade *
      tipFade;
    if (cover <= 0.002) { continue; }

    vec3 nq = surfaceNormal(q, dq);

    // Root-to-tip occlusion: light only reaches the top of the coat.
    float ao = mix(0.26, 1.0, pow(1.0 - taper, 0.7));
    float ndl = max(dot(nq, light), 0.0);
    vec3 col = mix(uDeep, uBody, ao);
    col *= 0.5 + 0.8 * ndl;
    // Backlit halo — the giveaway that a silhouette is fur and not a disc.
    col += uTip * pow(1.0 - nq.z, 3.0) * t * 0.95;
    col += vec3(1.0) * pow(max(dot(reflect(-light, nq), vec3(0.0, 0.0, 1.0)), 0.0), 26.0) * 0.2 * t;
    // Gentle per-strand tint. Wider spreads read as noise once strands are
    // near pixel-sized, because neighbouring pixels land on different cells.
    col *= 0.92 + 0.16 * rnd.y;

    acc.rgb += (1.0 - acc.a) * cover * col;
    acc.a += (1.0 - acc.a) * cover;
    if (acc.a > 0.995) { break; }
  }

  // Skin under the coat. Even at full width the strand discs leave pinholes
  // between cells, and a background showing through them reads as thin fur
  // rather than dense fur, so the body closes them from below. Faded in over
  // the first couple of units so the silhouette's hard edge never shows.
  float skin = smoothstep(0.0, -2.5, d0) * (1.0 - acc.a);
  if (skin > 0.0) {
    vec3 base = uDeep * (0.55 + 0.75 * max(dot(n0, light), 0.0));
    acc.rgb += skin * base;
    acc.a += skin;
  }

  // ─── eye, over the coat ────────────────────────────────────────────────────
  // Kept as the same flat mark the small engenties use — a white lens, a solid
  // pupil, one glint. The fur is what makes the creature; a shaded eyeball
  // would fight it, and at hero size a graphic eye still reads as a look.
  float phase = fract(uTime / 5.4);
  float blink = smoothstep(0.955, 0.972, phase) - smoothstep(0.972, 0.99, phase);
  vec2 ep = p - eyeCentre();
  ep.y /= max(1.0 - blink, 0.06);
  float er = uEye.z * 1.35;
  // The socket edge is softer than the lens edge, so the coat feels like it
  // closes over the rim rather than being cut with a cookie cutter.
  float aa = er * 0.06;
  acc.rgb *= mix(0.55, 1.0, smoothstep(er * 0.92, er * 1.5, length(ep)));

  float lens = smoothstep(er + aa, er - aa, length(ep));
  if (lens > 0.0) {
    // Almost half the lens radius: at 0.3 the look was lost under the coat's
    // own motion; the pupil still stays inside the white at full gaze.
    vec2 pupilAt = uGaze * er * 0.45;
    vec3 eyeCol = mix(
      vec3(0.94, 0.95, 0.98),
      vec3(0.10, 0.08, 0.18),
      smoothstep(er * 0.44, er * 0.38, length(ep - pupilAt))
    );
    eyeCol = mix(
      eyeCol,
      vec3(1.0),
      smoothstep(
        er * 0.15,
        er * 0.1,
        length(ep - pupilAt - vec2(-er * 0.15, -er * 0.18))
      )
    );
    acc.rgb = acc.rgb * (1.0 - lens) + eyeCol * lens;
    acc.a = acc.a * (1.0 - lens) + lens;
  }

  acc.rgb = acc.rgb * (1.0 - extras.a) + extras.rgb;
  acc.a = acc.a * (1.0 - extras.a) + extras.a;

  outColor = acc;
}
`;
