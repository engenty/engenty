/**
 * Engenty fills are CSS custom properties (`--cobalt`, `--ember`, …) so they
 * track the tenant's theme. The shader needs numbers, and the values may be
 * `oklch()` — which `getComputedStyle` hands back verbatim. Painting one pixel
 * and reading it back is the only conversion that works for every color syntax
 * a browser accepts, so that is what this does, memoized per resolved string.
 */

import type { EngentyKind } from "./colors";
import { ENGENTY_FILL } from "./colors";

export type Rgb = [number, number, number];

export interface FurPalette {
  /** Lit coat color. */
  body: Rgb;
  /** Deep in the coat, where light does not reach. */
  deep: Rgb;
  /** Backlit tips — the halo around the silhouette. */
  tip: Rgb;
}

const FILL_BY_KIND: Record<EngentyKind, keyof typeof ENGENTY_FILL> = {
  bean: "teal",
  dome: "moss",
  drop: "amber",
  flame: "rose",
  oval: "ember",
  pebble: "slate",
  round: "cobalt",
  sprout: "citron",
  tower: "violet",
  wedge: "magenta",
};

const cache = new Map<string, Rgb>();
let paint: CanvasRenderingContext2D | null = null;
/**
 * One probe per engenty, not one shared between them. A single probe has to be
 * re-parented into whichever engenty is asking, and moving a node forces a
 * synchronous style recalculation — once per engenty per frame, which took a
 * page of fourteen of them from 57fps to 1.
 */
const probes = new WeakMap<Element, HTMLElement>();

function readPixel(color: string): Rgb {
  const cached = cache.get(color);
  if (cached) {
    return cached;
  }
  if (!paint) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    paint = canvas.getContext("2d", { willReadFrequently: true });
  }
  // Mid grey keeps an unparseable color from rendering as a black blob.
  let rgb: Rgb = [0.5, 0.5, 0.5];
  if (paint) {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = "#808080";
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
    rgb = [r / 255, g / 255, b / 255];
  }
  cache.set(color, rgb);
  return rgb;
}

/**
 * Resolves a fill to RGB by letting the browser do it: the value is set on a
 * hidden probe parented inside `element`, so `var()` resolves against whatever
 * theme scope the engenty actually sits in, and `oklch(from …)` relative colors
 * resolve too. Picking the custom property apart by hand only ever worked for a
 * bare `var()`, which the derived fills are not.
 *
 * The computed value — never the authored string — is what gets cached, so a
 * theme switch is picked up on the next frame.
 */
function resolveFill(element: Element, value: string): Rgb {
  let probe = probes.get(element);
  if (!probe) {
    probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
    element.appendChild(probe);
    probes.set(element, probe);
  }
  probe.style.color = "";
  probe.style.color = value;
  return readPixel(getComputedStyle(probe).color || "#808080");
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Coat ramp for a kind. `deep` is the body pushed toward black with a little
 * hue left in it; `tip` is pushed toward white and *up* in saturation, because
 * a backlit strand takes on more chroma than the coat it sits on — that is what
 * gives the reference renders their violet fringe on a blue body.
 */
export function furPalette(element: Element, kind: EngentyKind): FurPalette {
  const body = resolveFill(element, ENGENTY_FILL[FILL_BY_KIND[kind]]);
  const peak = Math.max(...body);
  const boosted: Rgb = [
    Math.min(1, body[0] + (body[0] / (peak || 1)) * 0.45),
    Math.min(1, body[1] + (body[1] / (peak || 1)) * 0.45),
    Math.min(1, body[2] + (body[2] / (peak || 1)) * 0.45),
  ];
  return {
    body: mix(body, [1, 1, 1], 0.12),
    deep: mix(body, [0.03, 0.02, 0.06], 0.62),
    // Only a little white: a backlit tip should stay chromatic, which is what
    // puts the violet fringe on a blue coat instead of a grey one.
    tip: mix(boosted, [1, 1, 1], 0.12),
  };
}
