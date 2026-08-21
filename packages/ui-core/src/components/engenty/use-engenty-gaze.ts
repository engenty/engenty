"use client";

import { useEffect, useRef } from "react";

interface GazeHandle {
  ex: number;
  ey: number;
  glint: SVGCircleElement | null;
  lean: SVGGElement | null;
  max: number;
  pupil: SVGCircleElement | null;
  px: number;
  py: number;
  rot: number;
  shadow: SVGEllipseElement | null;
  svg: SVGSVGElement;
  tx: number;
  ty: number;
}

const cast = new Set<GazeHandle>();
const pointer = { x: 0, y: 0 };
let raf = 0;
let settle = 0;
let listening = false;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function tick() {
  raf = 0;
  const vh = window.innerHeight;
  let moving = false;

  for (const e of cast) {
    const rect = e.svg.getBoundingClientRect();
    if (rect.bottom < -40 || rect.top > vh + 40) {
      continue;
    }

    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.48;
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const reach = Math.min(rect.width, rect.height) * 2.4;
    const look = 0.35 + Math.min(1, dist / reach) * 0.65;

    const ttx = nx * 5.5 * look;
    const tty = ny * 3.5 * look;
    const trot = nx * 7 * look + ny * 1.2 * look;

    e.tx = lerp(e.tx, ttx, 0.16);
    e.ty = lerp(e.ty, tty, 0.16);
    e.rot = lerp(e.rot, trot, 0.14);

    if (e.lean) {
      e.lean.setAttribute(
        "transform",
        `translate(${e.tx.toFixed(2)} ${e.ty.toFixed(2)}) rotate(${e.rot.toFixed(2)} 60 62)`
      );
    }
    if (e.shadow) {
      e.shadow.setAttribute("cx", (60 - e.tx * 0.35).toFixed(2));
      e.shadow.setAttribute(
        "opacity",
        String(Math.max(0.08, 0.14 - Math.abs(e.ty) * 0.008))
      );
    }

    const tpx = e.ex + nx * e.max * look;
    const tpy = e.ey + 1 + ny * e.max * 0.9 * look;
    e.px = lerp(e.px, tpx, 0.24);
    e.py = lerp(e.py, tpy, 0.24);

    if (e.pupil) {
      e.pupil.setAttribute("cx", e.px.toFixed(2));
      e.pupil.setAttribute("cy", e.py.toFixed(2));
    }
    if (e.glint) {
      e.glint.setAttribute("cx", (e.px - 2).toFixed(2));
      e.glint.setAttribute("cy", (e.py - 3.4).toFixed(2));
    }

    if (Math.abs(e.tx - ttx) > 0.05 || Math.abs(e.px - tpx) > 0.05) {
      moving = true;
    }
  }

  if (moving || settle-- > 0) {
    raf = requestAnimationFrame(tick);
  }
}

function kick() {
  settle = 48;
  if (!raf) {
    raf = requestAnimationFrame(tick);
  }
}

function onMove(ev: PointerEvent) {
  pointer.x = ev.clientX;
  pointer.y = ev.clientY;
  kick();
}

function ensureListening() {
  if (listening || typeof window === "undefined") {
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  listening = true;
  pointer.x = window.innerWidth * 0.62;
  pointer.y = window.innerHeight * 0.28;
  window.addEventListener("pointermove", onMove, { passive: true });
  kick();
}

function stopIfEmpty() {
  if (cast.size > 0) {
    return;
  }
  if (!listening) {
    return;
  }
  listening = false;
  window.removeEventListener("pointermove", onMove);
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

/** Register an engenty SVG so pupils + body lean track the pointer. */
export function useEngentyGaze(
  svgRef: React.RefObject<SVGSVGElement | null>,
  eye: { ex: number; ey: number; max?: number },
  /** Decorative instances (background art) opt out of tracking. */
  enabled = true
) {
  const eyeRef = useRef(eye);
  eyeRef.current = eye;

  useEffect(() => {
    const svg = svgRef.current;
    if (!(svg && enabled)) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const { ex, ey, max = 3.2 } = eyeRef.current;
    const handle: GazeHandle = {
      svg,
      lean: svg.querySelector(".e-lean"),
      pupil: svg.querySelector(".e-pupil"),
      glint: svg.querySelector(".e-glint"),
      shadow: svg.querySelector(".e-shadow"),
      ex,
      ey,
      max,
      tx: 0,
      ty: 0,
      rot: 0,
      px: ex,
      py: ey + 1,
    };

    cast.add(handle);
    ensureListening();
    kick();

    return () => {
      cast.delete(handle);
      stopIfEmpty();
    };
  }, [svgRef, enabled, eye.ex, eye.ey, eye.max]);
}
