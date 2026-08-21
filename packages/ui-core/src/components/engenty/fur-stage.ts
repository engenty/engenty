/**
 * One WebGL2 context for every fluffy engenty on the page.
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

let stage: StageState | null = null;
/** Set once creation has failed, so every later caller fails fast. */
let unavailable = false;

function createStage(): StageState | null {
  if (unavailable || typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const renderer = createFurRenderer(canvas);
  if (!renderer) {
    unavailable = true;
    return null;
  }
  // A lost context cannot be recovered here — the shared canvas is torn down so
  // the next acquirer builds a fresh one rather than rendering into a dead one.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    stage = null;
  });
  return { canvas, refs: 0, renderer, size: 0 };
}

/**
 * Returns a handle on the shared context, or `null` when WebGL2 is unavailable
 * so the caller can fall back to the flat engenty. Every acquire must be
 * released; the context is torn down when the last one goes.
 */
export function acquireFurStage(): FurStage | null {
  stage ??= createStage();
  const acquired = stage;
  if (!acquired) {
    return null;
  }
  acquired.refs += 1;
  let released = false;

  return {
    drawInto(target, px, uniforms) {
      if (released || stage !== acquired) {
        return;
      }
      // Rendered 1:1 with the target on purpose. Supersampling here — render
      // large, let `drawImage` scale down — was measured at ~1fps across a page
      // of engenties: the scaled blit leaves the GPU path. Coverage is
      // antialiased analytically in the shader instead (see `radPerPixel`).
      const sampled = px;
      if (sampled > acquired.size) {
        acquired.size = sampled;
        acquired.canvas.width = sampled;
        acquired.canvas.height = sampled;
      }
      // The viewport sits at the drawing buffer's origin, which is its
      // bottom-left; in image space that is the bottom of the canvas.
      acquired.renderer.viewport(sampled);
      acquired.renderer.render(uniforms);
      target.clearRect(0, 0, target.canvas.width, target.canvas.height);
      target.drawImage(
        acquired.canvas,
        0,
        acquired.canvas.height - sampled,
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
      acquired.refs -= 1;
      if (acquired.refs <= 0 && stage === acquired) {
        acquired.renderer.dispose();
        stage = null;
      }
    },
  };
}
