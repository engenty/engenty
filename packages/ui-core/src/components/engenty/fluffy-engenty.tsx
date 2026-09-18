"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EngentyKind } from "./colors";
import { Engenty } from "./engenty";
import {
  ENGENTY_FORMS,
  formScale,
  packFormBlobs,
  packFormExtras,
} from "./forms";
import { furPalette } from "./fur-palette";
import { FUR_ORIGIN, FUR_SHELL_MAX, FUR_VIEW } from "./fur-shader";
import { acquireFurStage, type EngentyCoat } from "./fur-stage";
import { pointerPosition, subscribePointer } from "./pointer";

export type FurQuality = "low" | "medium" | "high";

/**
 * Shell count is the cost driver — every shell costs a field evaluation per
 * pixel. Density and strand width move with it: fewer, fatter strands still
 * read as fur once the engenty is small or far back, which is what `low` is.
 */
const QUALITY: Record<
  FurQuality,
  { density: number; dprCap: number; shells: number; thick: number }
> = {
  high: { density: 68, dprCap: 2, shells: 28, thick: 1 },
  low: { density: 40, dprCap: 1, shells: 12, thick: 1.15 },
  medium: { density: 55, dprCap: 1.5, shells: 20, thick: 1.05 },
};

/**
 * Smallest strand cell worth drawing, in rendered pixels. Below roughly this,
 * neighbouring pixels land on unrelated cells and the coat reads as noise
 * however well each strand is antialiased — so density is capped by the buffer
 * rather than by taste, and a small engenty simply gets fewer, larger strands.
 */
const MIN_CELL_PIXELS = 1.7;

/**
 * Rendered pixels between consecutive shells along a strand. Shells are
 * discrete samples of a continuous strand, so this is the sampling rate of the
 * coat's *length*: too coarse and the shader has to fatten strands to keep them
 * unbroken, which blunts the tips. Below about a pixel there is nothing left to
 * gain.
 */
const SHELL_STEP_PIXELS = 0.8;

/**
 * Every engenty runs the same idle cycle off its own clock, so a row of them
 * mounted together would breathe and blink in lockstep — which reads as a
 * screensaver, not a cast. Each instance takes the next offset off this
 * counter; the step is deliberately irrational relative to the blink and morph
 * periods so nearby instances never land in phase, and it stays deterministic
 * (no `Math.random`) so a remount does not make an engenty jump.
 */
let phaseCounter = 0;
const PHASE_STEP = 2.399_963;

/** Key light direction, in the shader's (x, y-down, toward-camera) space. */
const KEY_LIGHT: [number, number, number] = [-0.42, -0.72, 0.75];
/** Jelly wobble spring: stiffness and damping, per second. */
const SPRING_K = 260;
const SPRING_C = 7;

/** How far the silhouette bulges toward the camera, in form units. */
const DEFAULT_INFLATE = 30;
const DEFAULT_WIND = 0.5;

export interface FluffyEngentyOverrides {
  /** Jelly only: how see-through the gel is, 1 as designed down to 0 opaque. */
  clarity?: number;
  density?: number;
  fur?: number;
  inflate?: number;
  shells?: number;
  thick?: number;
  wind?: number;
}

export interface FluffyEngentyProps {
  className?: string;
  /** Shell fur (default) or a translucent jelly over the same body. */
  coat?: EngentyCoat;
  /** Pointer-driven lean and gaze. Off for purely decorative instances. */
  interactive?: boolean;
  kind?: EngentyKind;
  /** Live tuning — the styleguide playground drives these. */
  overrides?: FluffyEngentyOverrides;
  quality?: FurQuality;
  /** Rendered width/height in CSS pixels. Meant to be large: 200px and up. */
  size?: number;
}

/** Percentage of the padded canvas at a given coordinate in 0..120 form space. */
const viewPercent = (value: number) => ((value - FUR_ORIGIN) / FUR_VIEW) * 100;

/**
 * Large, fur-shaded engenty for landing pages and hero surfaces.
 *
 * Same five silhouettes as the flat `Engenty`, but rendered as procedural shell
 * fur (see `fur-shader.ts`) instead of a filled path. There is no model and no
 * texture: the coat is generated from the kind's metaball form, so adding a
 * form to `forms.ts` makes it fluffy for free.
 *
 * Falls back to the flat engenty wherever WebGL2 is unavailable.
 */
export function FluffyEngenty({
  className,
  coat = "fur",
  interactive = true,
  kind = "round",
  overrides,
  quality = "high",
  size = 260,
}: FluffyEngentyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);
  if (phase.current === 0) {
    phaseCounter += 1;
    phase.current = phaseCounter * PHASE_STEP;
  }
  const wrapRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState(true);

  const form = ENGENTY_FORMS[kind];
  const blobs = useMemo(() => packFormBlobs(form), [form]);
  const extras = useMemo(() => packFormExtras(form), [form]);
  const scale = useMemo(() => formScale(form), [form]);
  // The render loop reads props through a ref so playground sliders retune the
  // running frame instead of tearing down the GL context on every keystroke.
  const live = useRef({
    blobs,
    extras,
    form,
    interactive,
    kind,
    overrides,
    quality,
    scale,
    size,
  });
  live.current = {
    blobs,
    extras,
    form,
    interactive,
    kind,
    overrides,
    quality,
    scale,
    size,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!(canvas && wrap)) {
      return;
    }

    const context = canvas.getContext("2d");
    const stage = context ? acquireFurStage(coat) : null;
    if (!(context && stage)) {
      setSupported(false);
      return;
    }

    const phaseOffset = phase.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lean = { x: 0, y: 0 };
    const gaze = { x: 0, y: 0 };
    // A soft body chasing the lean on an under-damped spring. The lean itself
    // is what the fur uses; the jelly reads the overshoot past it as wobble.
    const gel = { vx: 0, vy: 0, x: 0, y: 0 };
    let frame = 0;
    let visible = true;
    // Clock is accumulated rather than read from `now`, so pausing off-screen
    // resumes the coat where it left off instead of jumping.
    let clock = 0;
    let last = 0;

    const draw = (now: number) => {
      frame = 0;
      const current = live.current;
      const preset = QUALITY[current.quality];
      const still = reduced.matches;

      const dt = still ? 0 : Math.min((now - (last || now)) / 1000, 0.1);
      clock += dt;
      last = now;

      const dpr = Math.min(window.devicePixelRatio || 1, preset.dprCap);
      const px = Math.max(1, Math.round(current.size * dpr));
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      // 120 form units of body span (120 / FUR_VIEW) of the rendered square.
      const maxDensity = (120 * px) / (MIN_CELL_PIXELS * FUR_VIEW);
      const fur = current.overrides?.fur ?? current.form.fur;
      // Shells cost a field evaluation per pixel each, so spend them on the
      // engenties big enough to show the difference: a hero needs the full
      // ladder, a 40px avatar does not.
      const autoShells = Math.min(
        FUR_SHELL_MAX,
        Math.max(
          preset.shells,
          Math.ceil((fur * px) / (FUR_VIEW * SHELL_STEP_PIXELS))
        )
      );

      if (current.interactive && !still) {
        const rect = wrap.getBoundingClientRect();
        const pointer = pointerPosition();
        const dx = pointer.x - (rect.left + rect.width * 0.5);
        const dy = pointer.y - (rect.top + rect.height * 0.48);
        const dist = Math.hypot(dx, dy) || 1;
        const look = 0.35 + Math.min(1, dist / (rect.width * 2.4 || 1)) * 0.65;
        // Same easing constants as the flat engenty's gaze rig, so a row that
        // mixes flat and fluffy engenties leans as one.
        lean.x += ((dx / dist) * 5.5 * look - lean.x) * 0.16;
        lean.y += ((dy / dist) * 3.5 * look - lean.y) * 0.16;
        // The pupil tracks harder than the body does, as it does on the flat
        // engenty, so a small head tilt still reads as a deliberate look.
        gaze.x += ((dx / dist) * look - gaze.x) * 0.24;
        gaze.y += ((dy / dist) * 0.9 * look - gaze.y) * 0.24;
      }
      // Semi-implicit Euler in two half-steps keeps the spring stable across a
      // dropped frame. ω ≈ 2.6 Hz, ζ ≈ 0.2: a few visible bounces, then still.
      for (let step = 0; step < 2; step++) {
        const h = Math.min(dt * 0.5, 0.05);
        gel.vx += ((lean.x - gel.x) * SPRING_K - gel.vx * SPRING_C) * h;
        gel.vy += ((lean.y - gel.y) * SPRING_K - gel.vy * SPRING_C) * h;
        gel.x += gel.vx * h;
        gel.y += gel.vy * h;
      }

      const palette = furPalette(wrap, current.kind);
      stage.drawInto(context, px, {
        blobs: current.blobs,
        clarity: current.overrides?.clarity ?? 1,
        body: palette.body,
        deep: palette.deep,
        density: Math.min(
          current.overrides?.density ?? preset.density,
          maxDensity
        ),
        extraMeta: current.extras.meta,
        extras: current.extras.geometry,
        eye: [current.form.eye.x, current.form.eye.y, current.form.eye.r],
        gaze: [gaze.x, gaze.y],
        fur,
        inflate: current.overrides?.inflate ?? DEFAULT_INFLATE,
        lean: [lean.x, lean.y],
        light: KEY_LIGHT,
        period: current.form.period,
        shells: current.overrides?.shells ?? autoShells,
        scale: current.scale,
        falloff: current.form.falloff,
        thick: current.overrides?.thick ?? preset.thick,
        time: clock + phaseOffset,
        tip: palette.tip,
        wind: current.overrides?.wind ?? DEFAULT_WIND,
        wobble: [gel.x - lean.x, gel.y - lean.y],
      });

      if (visible && !still) {
        frame = requestAnimationFrame(draw);
      }
    };

    const kick = () => {
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(draw);
      }
    };

    // A hero engenty is usually below the fold or scrolled past; an off-screen
    // canvas must not hold a rAF open.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) {
          kick();
        } else if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(wrap);

    const unsubscribe = subscribePointer(kick);
    reduced.addEventListener("change", kick);
    kick();

    return () => {
      observer.disconnect();
      unsubscribe();
      reduced.removeEventListener("change", kick);
      if (frame) {
        cancelAnimationFrame(frame);
      }
      stage.release();
    };
  }, [coat]);

  if (!supported) {
    return <Engenty className={className} kind={kind} size={size} />;
  }

  return (
    <div
      aria-hidden="true"
      className={className}
      ref={wrapRef}
      style={{ height: size, position: "relative", width: size }}
    >
      <div
        style={{
          background:
            "radial-gradient(closest-side, rgb(0 0 0 / 0.2), transparent)",
          filter: "blur(4px)",
          height: `${(form.shadowRx * 50) / FUR_VIEW}%`,
          left: "50%",
          position: "absolute",
          top: `${viewPercent(110)}%`,
          transform: "translate(-50%, -50%)",
          width: `${(form.shadowRx * 2.5 * 100) / FUR_VIEW}%`,
        }}
      />
      <canvas
        ref={canvasRef}
        style={{ display: "block", height: size, width: size }}
      />
    </div>
  );
}
