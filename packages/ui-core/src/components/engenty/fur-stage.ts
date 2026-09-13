/**
 * One WebGL2 context per coat for every large engenty on the page.
 *
 * Browsers cap live WebGL contexts per document (~16 in Chrome, fewer in
 * Safari) and silently evict the oldest once you pass it — so a page that gives
 * each engenty its own context breaks as soon as there are a few of them, which
 * a styleguide grid reaches immediately. Instead a single offscreen context
 * renders each engenty in turn and blits the result into that instance's plain
 * 2D canvas.
 *
 * The offscreen buffer only ever grows, so a mixed page settles on one
 * allocation sized to its largest engenty and stops reallocating.
 */

import {
  createFurRenderer,
  type FurRenderer,
  type FurUniforms,
} from "./fur-renderer";
import { FUR_FRAGMENT_SHADER } from "./fur-shader";
import { JELLY_FRAGMENT_SHADER } from "./jelly-shader";

/** How the large engenty is surfaced: shell fur, or a translucent gel. */
export type EngentyCoat = "fur" | "jelly";

const COAT_SHADER: Record<EngentyCoat, string> = {
  fur: FUR_FRAGMENT_SHADER,
  jelly: JELLY_FRAGMENT_SHADER,
};

export interface FurStage {
  /** Renders `uniforms` at `px` square and copies it into `target`. */
  drawInto: (
    target: CanvasRenderingContext2D,
    px: number,
    uniforms: FurUniforms
  ) => void;
  release: () => void;
}

interface StageState {
  canvas: HTMLCanvasElement;
  refs: number;
  renderer: FurRenderer;
  size: number;
}

const stages = new Map<EngentyCoat, StageState>();
/** Set once creation has failed, so every later caller fails fast. */
const unavailable = new Set<EngentyCoat>();

function createStage(coat: EngentyCoat): StageState | null {
  if (unavailable.has(coat) || typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const renderer = createFurRenderer(canvas, COAT_SHADER[coat]);
  if (!renderer) {
    unavailable.add(coat);
    return null;
  }
  // A lost context cannot be recovered here — the shared canvas is torn down so
  // the next acquirer builds a fresh one rather than rendering into a dead one.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    stages.delete(coat);
  });
  return { canvas, refs: 0, renderer, size: 0 };
}

/**
 * Returns a handle on the shared context for `coat`, or `null` when WebGL2 is
 * unavailable so the caller can fall back to the flat engenty. Every acquire
 * must be released; the context is torn down when the last one goes.
 */
export function acquireFurStage(coat: EngentyCoat = "fur"): FurStage | null {
  let acquired = stages.get(coat);
  if (!acquired) {
    const created = createStage(coat);
    if (!created) {
      return null;
    }
    stages.set(coat, created);
    acquired = created;
  }
  const stage = acquired;
  stage.refs += 1;
  let released = false;

  return {
    drawInto(target, px, uniforms) {
      if (released || stages.get(coat) !== stage) {
        return;
      }
      // Rendered 1:1 with the target on purpose. Supersampling here — render
      // large, let `drawImage` scale down — was measured at ~1fps across a page
      // of engenties: the scaled blit leaves the GPU path. Coverage is
      // antialiased analytically in the shader instead (see `radPerPixel`).
      const sampled = px;
      if (sampled > stage.size) {
        stage.size = sampled;
        stage.canvas.width = sampled;
        stage.canvas.height = sampled;
      }
      // The viewport sits at the drawing buffer's origin, which is its
      // bottom-left; in image space that is the bottom of the canvas.
      stage.renderer.viewport(sampled);
      stage.renderer.render(uniforms);
      target.clearRect(0, 0, target.canvas.width, target.canvas.height);
      target.drawImage(
        stage.canvas,
        0,
        stage.canvas.height - sampled,
        sampled,
        sampled,
        0,
        0,
        target.canvas.width,
        target.canvas.height
      );
    },
    release() {
      if (released) {
        return;
      }
      released = true;
      stage.refs -= 1;
      if (stage.refs <= 0 && stages.get(coat) === stage) {
        stage.renderer.dispose();
        stages.delete(coat);
      }
    },
  };
}
