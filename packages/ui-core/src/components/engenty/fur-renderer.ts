/**
 * WebGL2 lifecycle for the fur shader: one program, one fullscreen triangle,
 * a flat uniform record per frame. Deliberately framework-free so the same
 * renderer can drive a React component, a landing-page hero, or an offscreen
 * canvas used to bake a still.
 */

import {
  FUR_FRAGMENT_SHADER,
  FUR_SHELL_MAX,
  FUR_VERTEX_SHADER,
} from "./fur-shader";

export interface FurUniforms {
  blobs: Float32Array;
  body: [number, number, number];
  deep: [number, number, number];
  density: number;
  eye: [number, number, number];
  falloff: number;
  fur: number;
  gaze: [number, number];
  inflate: number;
  lean: [number, number];
  light: [number, number, number];
  period: number;
  scale: number;
  shells: number;
  thick: number;
  time: number;
  tip: [number, number, number];
  wind: number;
}

export interface FurRenderer {
  dispose: () => void;
  render: (uniforms: FurUniforms) => void;
  /** Draws the next `render` into a `px` square at the buffer's origin. */
  viewport: (px: number) => void;
}

const UNIFORM_NAMES = [
  "uResolution",
  "uTime",
  "uBlobs",
  "uFalloff",
  "uScale",
  "uFur",
  "uPeriod",
  "uInflate",
  "uDensity",
  "uThick",
  "uShells",
  "uLean",
  "uLight",
  "uBody",
  "uDeep",
  "uTip",
  "uEye",
  "uWind",
  "uGaze",
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("engenty fur: could not create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`engenty fur: shader compile failed — ${log}`);
  }
  return shader;
}

/**
 * Returns `null` when WebGL2 is unavailable (older Safari, blocklisted GPUs,
 * headless test runners) so callers can fall back to the flat engenty.
 */
export function createFurRenderer(
  canvas: HTMLCanvasElement
): FurRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    // The canvas is redrawn every frame; not preserving it lets the driver
    // skip a copy, and lets a paused rAF keep the last frame on screen anyway.
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (!gl) {
    return null;
  }

  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  try {
    const vert = compile(gl, gl.VERTEX_SHADER, FUR_VERTEX_SHADER);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FUR_FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) {
      throw new Error("engenty fur: could not create program");
    }
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `engenty fur: link failed — ${gl.getProgramInfoLog(program)}`
      );
    }
  } catch (error) {
    if (program) {
      gl.deleteProgram(program);
    }
    // Falling back silently would hide a broken shader behind a plausible flat
    // engenty, so say what went wrong even though the render still degrades.
    // biome-ignore lint/suspicious/noConsole: the fallback is otherwise invisible.
    console.error(error);
    return null;
  }

  const loc = {} as Record<UniformName, WebGLUniformLocation | null>;
  for (const name of UNIFORM_NAMES) {
    loc[name] = gl.getUniformLocation(program, name);
  }

  // One oversized triangle covers the viewport with no index buffer.
  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // `gl.useProgram` matches the React hook naming rule, which then objects to
  // it being called inside a branch. Alias it once, here at the top level.
  const bindProgram = gl.useProgram.bind(gl);

  gl.enable(gl.BLEND);
  // Shader output is premultiplied (see the front-to-back accumulation).
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let disposed = false;
  let viewportPx = 1;

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      // Deliberately NOT `loseContext()`: `getContext` hands back the *same*
      // context object for a canvas, so poisoning it here would leave any
      // later renderer on that canvas permanently broken — which is exactly
      // what React StrictMode's mount/unmount/mount does in development.
    },
    render(u) {
      if (!disposed) {
        bindProgram(program);
        gl.uniform2f(loc.uResolution, viewportPx, viewportPx);
        gl.uniform1f(loc.uTime, u.time);
        gl.uniform4fv(loc.uBlobs, u.blobs);
        gl.uniform1f(loc.uFalloff, u.falloff);
        gl.uniform1f(loc.uScale, u.scale);
        gl.uniform1f(loc.uFur, u.fur);
        gl.uniform1f(loc.uPeriod, u.period);
        gl.uniform1f(loc.uInflate, u.inflate);
        gl.uniform1f(loc.uDensity, u.density);
        gl.uniform1f(loc.uThick, u.thick);
        gl.uniform1i(loc.uShells, Math.min(u.shells, FUR_SHELL_MAX));
        gl.uniform2fv(loc.uLean, u.lean);
        gl.uniform3fv(loc.uLight, u.light);
        gl.uniform3fv(loc.uBody, u.body);
        gl.uniform3fv(loc.uDeep, u.deep);
        gl.uniform3fv(loc.uTip, u.tip);
        gl.uniform3fv(loc.uEye, u.eye);
        gl.uniform1f(loc.uWind, u.wind);
        gl.uniform2fv(loc.uGaze, u.gaze);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, 0, viewportPx, viewportPx);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    },
    viewport(px) {
      if (!disposed) {
        viewportPx = px;
        gl.viewport(0, 0, px, px);
      }
    },
  };
}
