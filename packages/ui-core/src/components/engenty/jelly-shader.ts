/**
 * Jelly coat: the same inflated metaball body as the fur, rendered as a
 * translucent gel instead of a pile of strands.
 *
 * The look is a small physical model rather than a paint job, the way a
 * transmissive PBR material would be set up for a gummy:
 *
 *   - Transmission is Beer–Lambert over the view chord through the inflated
 *     body. Light enters through a pale skin and is absorbed per channel along
 *     the chord, so the thin rim stays pale and the thick centre lands on the
 *     kind's saturated colour — thickness, not a gradient, makes the colour.
 *   - Reflection is Schlick Fresnel at a gel's refractive index (~1.35) against
 *     a synthetic room: a dim floor, a lighter ceiling and one bright soft
 *     window in the key direction. The window is reflected twice — sharp for a
 *     clearcoat-like wet skin, broad for the gloss underneath — so the
 *     highlight is a window shape, not a specular dot; a hot dot is what read
 *     as grease.
 *   - The rim's Fresnel is split slightly per channel, a hint of dispersion.
 *   - Light that entered on the lit side exits at the far rim, tinted by the
 *     full chord.
 *   - The body is a soft solid: an under-damped spring on the host side chases
 *     the pointer lean and the overshoot arrives here as `uWobble`, a
 *     top-heavy shear with a volume-preserving squash.
 *
 * Alpha follows clarity: the band shows through the whole mass, most at the
 * thin rim, and the reflection is opaque where bright. The
 * eye and the decals are the same flat marks the fur draws.
 */

import { FUR_COMMON_GLSL } from "./fur-shader";

export const JELLY_FRAGMENT_SHADER = `${FUR_COMMON_GLSL}
/** Luminance, for turning a reflection into coverage. */
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/**
 * Coverage of a soft rectangular window seen in direction \`r\`, sitting in
 * the key direction \`w\`. \`soft\` is the blur of the lobe reflecting it.
 */
float windowLobe(vec3 r, vec3 w, float soft, bool panes) {
  float facing = dot(r, w);
  if (facing <= 0.0) { return 0.0; }
  // Tangent frame around the window direction.
  vec3 ax = normalize(cross(w, vec3(0.0, 0.0, 1.0)));
  vec3 ay = cross(w, ax);
  vec2 q = vec2(dot(r, ax), dot(r, ay)) / facing;
  vec2 half_ = vec2(0.26, 0.42);
  vec2 cov = smoothstep(half_ + soft, half_ - soft, abs(q));
  float win = cov.x * cov.y;
  if (panes) {
    // Mullions: two columns, three rows. The grid is what makes a bright
    // patch read as a window and the surface as glass.
    float bar = 0.018;
    float mx = 1.0 - smoothstep(bar, bar + soft, abs(q.x));
    float my = 1.0 - smoothstep(bar, bar + soft, abs(abs(q.y) - 0.14));
    win *= 1.0 - 0.85 * max(mx, my);
  }
  return win;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = vec2(uv.x, 1.0 - uv.y) * VIEW + ORIGIN;

  // ─── soft body ─────────────────────────────────────────────────────────────
  // The base is stuck to the band; the top swings. Sideways overshoot shears,
  // vertical overshoot squashes and the width bulges to keep the volume.
  float top = clamp(1.0 - p.y / 120.0, 0.0, 1.0);
  float squash = uWobble.y * 0.012 * top;
  p.x = (p.x - 60.0) / (1.0 + squash) + 60.0;
  p.y = (p.y - 120.0) * (1.0 + squash) + 120.0;
  p.x += uWobble.x * 1.5 * top * top;
  // A gel never quite settles: a small idle quiver on top of the spring.
  float jig = sin(TAU * uTime / (uPeriod * 0.55));
  p.x += jig * 0.45 * top;

  float d0 = sdBody(p);
  float aaPx = fwidth(p.x) * 0.75;
  vec3 ink = mix(uDeep, vec3(0.0), 0.45);
  vec4 extras = extrasOver(p, ink, uBody, aaPx);
  if (d0 > 1.5) {
    outColor = extras;
    return;
  }

  vec3 n = surfaceNormal(p, d0);
  vec3 light = normalize(uLight);
  vec3 view = vec3(0.0, 0.0, 1.0);
  // 1 at the thick centre, 0 at the rim.
  float ndv = clamp(n.z, 0.0, 1.0);

  // ─── transmission ──────────────────────────────────────────────────────────
  // The view chord through a bulge is proportional to n·v. Absorption is set
  // per channel so a full chord lands on the kind's colour; the pale skin is
  // what a thin edge of the same gel looks like.
  vec3 skin = mix(uBody, vec3(1.0), 0.38);
  vec3 sigma = -log(max(uBody, 0.02) / skin);
  // The path light takes to reach the eye is longer on the side away from
  // the key, so the mass reads thickest just off-centre toward the shadow.
  float side = clamp(-dot(n.xy, light.xy), -1.0, 1.0);
  float chord = ndv * (1.15 + 0.35 * side);
  vec3 through = exp(-sigma * chord);
  vec3 gel = skin * through;

  // Scattering carries light around a gummy — a wrapped terminator rather than
  // a hard one — but the shadow side still has to fall off into the deep
  // colour, or the body reads as a flat sticker with a bright edge.
  float wrap = clamp((dot(n, light) + 0.35) / 1.35, 0.0, 1.0);
  vec3 lit = gel * (0.55 + 0.6 * wrap);
  vec3 shade = mix(uDeep, gel, 0.45) * 0.7;
  vec3 col = mix(shade, lit, smoothstep(0.0, 0.75, wrap));
  // Ambient falls off toward the base: the band lights it from above.
  col *= 1.0 - 0.18 * clamp(p.y / 120.0, 0.0, 1.0);
  // Contact occlusion where the mass sits on the band.
  col *= 1.0 - 0.25 * smoothstep(0.55, 1.0, p.y / 120.0) * (1.0 - ndv);

  // Light that went in on the lit side comes out at the far rim, having
  // crossed the whole body.
  float back = pow(max(dot(n, normalize(vec3(-light.xy, 0.25))), 0.0), 3.0) * (1.0 - ndv);
  col += uTip * exp(-sigma * 0.5) * back * 0.7;

  // ─── reflection ────────────────────────────────────────────────────────────
  // Schlick at IOR 1.35 (F0 ≈ 0.022), split a little per channel.
  float f0 = 0.022;
  vec3 fres = f0 + (1.0 - f0) * vec3(
    pow(1.0 - ndv, 4.6),
    pow(1.0 - ndv, 5.0),
    pow(1.0 - ndv, 5.5)
  );
  vec3 r = reflect(-view, n);
  // Room: dim floor below, lighter above (y is down), one window key-side.
  vec3 room = mix(vec3(0.14, 0.13, 0.16), vec3(0.5, 0.52, 0.58), smoothstep(-0.7, 0.9, -r.y));
  float windowHdr = 14.0;
  vec3 gloss = (room + vec3(1.0) * windowLobe(r, light, 0.34, false) * windowHdr * 0.5) * fres * 1.5;
  // Wet skin on top: the same window, sharp, and visible face-on.
  vec3 coat = vec3(1.0) * windowLobe(r, light, 0.05, true) * windowHdr * (f0 * 1.5 + fres.g * 0.6);
  // The rim itself: a thin bright line where the skin turns fully edge-on.
  vec3 reflection = gloss + coat + vec3(0.9) * pow(1.0 - ndv, 12.0) * 0.3 * smoothstep(0.3, 1.0, -r.y * 0.5 + 0.5);
  // Soft shoulder instead of clipping: the window stays a shape at the rim.
  reflection = 1.0 - exp(-reflection);
  col = col * (1.0 - fres * 0.6) + reflection;

  // ─── coverage ──────────────────────────────────────────────────────────────
  // Clear where thin, scattering where thick; a bright reflection is opaque.
  // A gel is see-through: the band shows through the whole mass, most at the
  // rim. One alpha cannot filter per channel, so this is a tinted mix rather
  // than true transmission, but it is what makes it read as gel and not paint.
  float edge = smoothstep(0.9, -0.9, d0);
  float clarity = mix(0.5, 0.14, smoothstep(0.0, 0.7, ndv)) * uClarity;
  float alpha = edge * min(1.0, (1.0 - clarity) + lum(reflection));
  vec4 acc = vec4(min(col, vec3(1.0)) * alpha, alpha);

  // ─── eye, in the gel ───────────────────────────────────────────────────────
  float phase = fract(uTime / 5.4);
  float blink = smoothstep(0.955, 0.972, phase) - smoothstep(0.972, 0.99, phase);
  vec2 ep = p - eyeCentre();
  ep.y /= max(1.0 - blink, 0.06);
  float er = uEye.z * 1.35;
  float aa = er * 0.06;
  // A soft dark socket under the lens, as if it sits a little inside the gel.
  acc.rgb *= mix(0.7, 1.0, smoothstep(er * 0.95, er * 1.4, length(ep)));

  float lens = smoothstep(er + aa, er - aa, length(ep));
  if (lens > 0.0) {
    // ─── glass eye ─────────────────────────────────────────────────────────
    // The lens is a dome set into the gel and the pupil a dark glass bead on
    // it: each has its own hemisphere normal and is shaded like the body —
    // window reflection, Fresnel rim, a little light leaking through the
    // bead's far side — rather than painted flat.
    vec2 el = ep / er;
    float ez = sqrt(max(0.0, 1.0 - dot(el, el)));
    vec3 en = vec3(el, ez);
    float ndlE = max(dot(en, light), 0.0);
    // Sclera: milky glass, darker where the dome meets the socket.
    vec3 eyeCol = vec3(0.93, 0.94, 0.97) * (0.62 + 0.38 * ndlE) * mix(0.55, 1.0, smoothstep(0.0, 0.5, ez));

    vec2 pupilAt = uGaze * er * 0.45;
    float pr = er * 0.42;
    vec2 pl = (ep - pupilAt) / pr;
    float pz = sqrt(max(0.0, 1.0 - dot(pl, pl)));
    vec3 pn = vec3(pl, pz);
    float pupil = smoothstep(pr + aa, pr - aa, length(ep - pupilAt));
    if (pupil > 0.0) {
      vec3 bead = mix(vec3(0.05, 0.04, 0.10), vec3(0.16, 0.13, 0.24), pow(1.0 - pz, 2.0));
      // The bead is transparent too: light entering at the top leaves at the
      // bottom edge, warmed by the iris.
      float leak = pow(max(dot(pn, normalize(vec3(-light.xy, 0.2))), 0.0), 4.0) * (1.0 - pz);
      bead += mix(uTip, vec3(1.0), 0.4) * leak * 0.55;
      vec3 pr_ = reflect(-view, pn);
      float pf = 0.03 + 0.97 * pow(1.0 - pz, 5.0);
      // A bead this small would show the window as a speck; a flatter
      // reflection normal spreads it to the broad soft patch a glass eye has.
      vec3 prw = reflect(-view, normalize(vec3(pl * 0.4, pz)));
      vec3 pref = (mix(vec3(0.12), vec3(0.6), smoothstep(-0.7, 0.9, -pr_.y)) * pf * 2.0)
        + vec3(1.0) * windowLobe(prw, light, 0.1, true) * windowHdr * (0.05 + pf * 0.5);
      bead += 1.0 - exp(-pref);
      eyeCol = mix(eyeCol, min(bead, vec3(1.0)), pupil);
    }

    // Wet skin over the whole lens.
    vec3 er_ = reflect(-view, en);
    float ef = 0.022 + 0.978 * pow(1.0 - ez, 5.0);
    vec3 lensRef = vec3(0.7, 0.72, 0.8) * ef * 1.6
      + vec3(1.0) * windowLobe(er_, light, 0.06, true) * windowHdr * (0.02 + ef * 0.3);
    eyeCol += 1.0 - exp(-lensRef);

    acc.rgb = acc.rgb * (1.0 - lens) + min(eyeCol, vec3(1.0)) * lens;
    acc.a = acc.a * (1.0 - lens) + lens;
  }

  // Decals sit in the gel: slightly softened by the coat's own alpha, and the
  // wet skin's reflection lies over them.
  float da = extras.a * 0.92;
  acc.rgb = acc.rgb * (1.0 - da) + (extras.rgb + coat * extras.a * 0.5) * 0.92;
  acc.a = acc.a * (1.0 - da) + da;

  outColor = acc;
}
`;
