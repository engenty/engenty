/**
 * The lobby as a live 3D scene, rendered to look like pixel art.
 *
 * Real boxes, cylinders and spheres lit with a stepped (toon) gradient, drawn
 * by an orthographic camera at the same 2:1 angle as the 2D tile grid in
 * `pixel-room-geometry.ts`, into a 240×168 target. A post pass then inks a
 * one-pixel outline wherever the depth buffer steps (silhouettes, tile seams)
 * and darkens creases where normals turn. The canvas is scaled up with
 * `image-rendering: pixelated`, so every rendered pixel is a real pixel.
 */
import {
  AmbientLight,
  BasicShadowMap,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DataTexture,
  DepthTexture,
  DirectionalLight,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshToonMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import type { RoomPalette } from "./pixel-room";
import {
  OX,
  OY,
  ROOM_H,
  ROOM_W,
  TH,
  TILES,
  TW,
  WALL_H,
} from "./pixel-room-geometry";

/** Screen pixels per unit on the camera's image plane. A tile edge (1 unit
 *  along x) foreshortens to TW/2 · √2 of those before it lands on screen as
 *  the (TW/2, TH/2) diamond side. */
const PX = (TW / 2) * Math.SQRT2;
/** Camera pitch for a 2:1 diamond: sin(pitch) = TH / TW. */
const PITCH = Math.asin(TH / TW);
/** Screen pixels per world unit of height. */
const PX_Y = PX * Math.cos(PITCH);
/** World units of wall height, so the wall is WALL_H pixels tall. */
const WH = WALL_H / PX_Y;
/** Wall thickness, and the tile height above the grout slab. */
const T = 0.16;
const TILE_H = 0.14;
const LIP = 0.16;

const NEAR = 1;
const FAR = 41;
const CAM_DIST = 20;

export interface LobbyRoomHandle {
  dispose(): void;
  setPlaying(playing: boolean): void;
}

/** A texture the toon material steps its light through: four flat bands. */
function gradientMap(): DataTexture {
  const tex = new DataTexture(
    new Uint8Array([122, 178, 226, 255]),
    4,
    1,
    RedFormat,
  );
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Dotted wallpaper: a dot every half unit, rows staggered. */
function wallpaper(base: string, dot: string): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = dot;
  ctx.fillRect(3, 3, 1, 1);
  ctx.fillRect(11, 11, 1, 1);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

/** Faceted normals, so spheres shade as a few flat facets. */
function faceted(geo: BufferGeometry): BufferGeometry {
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  geo.dispose();
  return flat;
}

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 texel;
uniform vec3 ink;
varying vec2 vUv;

float depthAt(vec2 o) { return texture2D(tDepth, vUv + o * texel).r; }
vec3 normalAt(vec2 o) {
  return normalize(texture2D(tNormal, vUv + o * texel).xyz * 2.0 - 1.0);
}

void main() {
  vec4 c = texture2D(tColor, vUv);
  float d = depthAt(vec2(0.0));
  // Second difference of depth: zero on a flat plane, a spike at a step.
  // Negative means this pixel sits farther back than its neighbours.
  float lx = depthAt(vec2(1.0, 0.0)) + depthAt(vec2(-1.0, 0.0)) - 2.0 * d;
  float ly = depthAt(vec2(0.0, 1.0)) + depthAt(vec2(0.0, -1.0)) - 2.0 * d;
  float back = -min(lx, ly);
  float front = max(lx, ly);
  const float STEP = 0.0008;

  vec3 n = normalAt(vec2(0.0));
  float crease = max(
    1.0 - dot(n, normalAt(vec2(0.0, 1.0))),
    1.0 - dot(n, normalAt(vec2(-1.0, 0.0)))
  );

  vec3 rgb = c.rgb;
  float a = c.a;
  if (d < 1.0 && crease > 0.45 && front <= STEP) rgb *= 0.74;
  if (front > STEP && d < 1.0) rgb = mix(rgb, vec3(1.0), 0.1);
  if (back > STEP) {
    rgb = ink;
    a = 1.0;
  }
  if (a <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // The target holds linear light; the canvas wants sRGB.
  rgb = mix(rgb * 12.92, 1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, rgb));
  gl_FragColor = vec4(rgb, a);
}
`;

export function mountLobbyRoom(
  canvas: HTMLCanvasElement,
  p: RoomPalette,
  animate: boolean,
): LobbyRoomHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(ROOM_W, ROOM_H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = BasicShadowMap;

  const disposables: { dispose(): void }[] = [renderer];
  const track = <D extends { dispose(): void }>(d: D): D => {
    disposables.push(d);
    return d;
  };

  // ---- Camera: the 2D grid's angle, framed so tile (0,0)'s far corner
  // lands on (OX, OY) of the 240×168 image.
  const dir = new Vector3(
    Math.cos(PITCH) * Math.SQRT1_2,
    Math.sin(PITCH),
    Math.cos(PITCH) * Math.SQRT1_2,
  );
  const up = new Vector3(
    -Math.sin(PITCH) * Math.SQRT1_2,
    Math.cos(PITCH),
    -Math.sin(PITCH) * Math.SQRT1_2,
  );
  const halfW = ROOM_W / 2 / PX;
  const halfH = ROOM_H / 2 / PX;
  const camera = new OrthographicCamera(
    -halfW,
    halfW,
    halfH,
    -halfH,
    NEAR,
    FAR,
  );
  // The image centre is (ROOM_W/2, ROOM_H/2); the origin should sit
  // (ROOM_H/2 - OY) px above it and (OX - ROOM_W/2) px left of it.
  const right = new Vector3().crossVectors(dir, up).negate();
  const target = new Vector3()
    .addScaledVector(up, -(ROOM_H / 2 - OY) / PX)
    .addScaledVector(right, (ROOM_W / 2 - OX) / PX);
  camera.up.copy(up);
  camera.position.copy(target).addScaledVector(dir, CAM_DIST);
  camera.lookAt(target);
  camera.updateProjectionMatrix();

  // ---- Materials.
  const grad = track(gradientMap());
  const toon = (hex: string, map?: Texture | null) =>
    track(
      new MeshToonMaterial({
        color: map ? 0xffffff : new Color(hex),
        gradientMap: grad,
        map: map ?? null,
      }),
    );
  const flat = (hex: string) =>
    track(new MeshBasicMaterial({ color: new Color(hex) }));

  const paperL = wallpaper(p.wall, p.wallLine);
  const paperR = wallpaper(p.wallLit, p.wallLine);
  if (paperL) {
    track(paperL);
    paperL.repeat.set((TILES + T) * 2, WH * 2);
  }
  if (paperR) {
    track(paperR);
    paperR.repeat.set((TILES + T) * 2, WH * 2);
  }
  const m = {
    wallL: toon(p.wall, paperL),
    wallR: toon(p.wallLit, paperR),
    panelL: toon(p.wallDark),
    panelR: toon(p.wallLitDark),
    post: toon(p.wallDark),
    trim: toon(p.wallLight),
    skirting: toon(p.skirting),
    floorA: toon(p.floor),
    floorB: toon(p.floorAlt),
    grout: toon(p.floorLine),
    rug: toon(p.rug),
    rugLine: toon(p.rugLine),
    ink: toon(p.ink),
    door: toon(p.door),
    doorLight: toon(p.doorLight),
    brass: toon(p.rug),
    crate: toon(p.crate),
    crateLight: toon(p.crateLight),
    crateDark: toon(p.crateDark),
    leaf: toon(p.leaf),
    leafDark: toon(p.leafDark),
    sky: flat(p.sky),
    skyLow: flat(p.skyLow),
    cloud: flat(p.cloud),
    pictureSky: flat(p.sky),
    pictureLeaf: flat(p.leaf),
  };

  // ---- Scene.
  const scene = new Scene();
  const geos: BufferGeometry[] = [];
  const box = (
    w: number,
    h: number,
    d: number,
    mat: Material,
    x: number,
    y: number,
    z: number,
    opts: { cast?: boolean; receive?: boolean; parent?: Group } = {},
  ): Mesh => {
    const geo = new BoxGeometry(w, h, d);
    geos.push(geo);
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.cast ?? true;
    mesh.receiveShadow = opts.receive ?? true;
    (opts.parent ?? scene).add(mesh);
    return mesh;
  };

  // Floor: a dark slab (its front faces are the room's lip) with a checker
  // of tiles on top, leaving a grout gap that the post pass inks.
  const N = TILES;
  box(N + T, LIP, N + T, m.grout, (N - T) / 2, -TILE_H - LIP / 2, (N - T) / 2, {
    cast: false,
  });
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      box(
        0.94,
        TILE_H,
        0.94,
        (i + j) % 2 === 0 ? m.floorA : m.floorB,
        i + 0.5,
        -TILE_H / 2,
        j + 0.5,
        { cast: false },
      );
    }
  }

  // Walls, sitting on the slab. The left wall runs along z, the right wall
  // along x; the right one has a window cut out of it.
  const wallBottom = -TILE_H;
  const wallMid = wallBottom + (WH + TILE_H) / 2;
  const wallTall = WH + TILE_H;
  box(T, wallTall, N + T, m.wallL, -T / 2, wallMid, (N - T) / 2, {
    cast: false,
  });
  // Window opening on the right wall, in wall-length units from the corner.
  const winX0 = 22 / (TW / 2);
  const winX1 = 60 / (TW / 2);
  const winTop = WH - 6 / PX_Y;
  const winBot = WH - 38 / PX_Y;
  box(winX0, wallTall, T, m.wallR, winX0 / 2, wallMid, -T / 2, { cast: false });
  box(N - winX1, wallTall, T, m.wallR, (N + winX1) / 2, wallMid, -T / 2, {
    cast: false,
  });
  box(
    winX1 - winX0,
    WH - winTop,
    T,
    m.wallR,
    (winX0 + winX1) / 2,
    (WH + winTop) / 2,
    -T / 2,
    { cast: false },
  );
  box(
    winX1 - winX0,
    winBot - wallBottom,
    T,
    m.wallR,
    (winX0 + winX1) / 2,
    (winBot + wallBottom) / 2,
    -T / 2,
    { cast: false },
  );
  // Corner post and cornice.
  box(0.12, wallTall + 0.04, 0.12, m.post, 0, wallMid + 0.02, 0);
  box(0.06, 0.08, N + T, m.trim, 0.03, WH - 0.04, (N - T) / 2, {
    cast: false,
  });
  box(N + T, 0.08, 0.06, m.trim, (N - T) / 2, WH - 0.04, 0.03, {
    cast: false,
  });
  // Dado rail, panelling with upright battens, and the skirting board.
  const rail = WH - 22 / PX_Y;
  const skirtH = 4 / PX_Y;
  const panelH = rail - skirtH;
  box(0.08, 0.06, N, m.trim, 0.04, rail, N / 2, { cast: false });
  box(N, 0.06, 0.08, m.trim, N / 2, rail, 0.04, { cast: false });
  box(0.04, panelH, N, m.panelL, 0.02, skirtH + panelH / 2, N / 2, {
    cast: false,
  });
  box(N, panelH, 0.04, m.panelR, N / 2, skirtH + panelH / 2, 0.02, {
    cast: false,
  });
  box(0.1, skirtH, N, m.skirting, 0.05, skirtH / 2, N / 2, { cast: false });
  box(N, skirtH, 0.1, m.skirting, N / 2, skirtH / 2, 0.05, { cast: false });
  box(0.1, 0.05, N, m.trim, 0.05, skirtH - 0.025, N / 2, { cast: false });
  box(N, 0.05, 0.1, m.trim, N / 2, skirtH - 0.025, 0.05, { cast: false });

  // Door on the left wall: ink frame, panel, two insets, a brass knob.
  const doorZ0 = 26 / (TW / 2);
  const doorZ1 = 52 / (TW / 2);
  const doorTop = WH - 8 / PX_Y;
  const doorBot = skirtH;
  const doorZ = (doorZ0 + doorZ1) / 2;
  const doorY = (doorTop + doorBot) / 2;
  box(0.08, doorTop - doorBot, doorZ1 - doorZ0, m.ink, 0.04, doorY, doorZ, {
    cast: false,
  });
  box(
    0.12,
    doorTop - doorBot - 0.25,
    doorZ1 - doorZ0 - 0.25,
    m.door,
    0.06,
    doorY,
    doorZ,
    { cast: false },
  );
  const insetTop = WH - 14 / PX_Y;
  box(
    0.16,
    14 / PX_Y,
    14 / (TW / 2),
    m.doorLight,
    0.08,
    insetTop - 7 / PX_Y,
    doorZ,
    {
      cast: false,
    },
  );
  const insetLow = WH - 32 / PX_Y;
  box(
    0.16,
    10 / PX_Y,
    14 / (TW / 2),
    m.doorLight,
    0.08,
    insetLow - 5 / PX_Y,
    doorZ,
    {
      cast: false,
    },
  );
  box(0.18, 0.1, 0.1, m.brass, 0.09, WH - 29 / PX_Y, doorZ0 + 4 / (TW / 2));

  // A picture on the left wall, near the corner: a little landscape.
  const picZ = (6 + 22) / 2 / (TW / 2);
  const picY = WH - 15 / PX_Y;
  box(0.08, 14 / PX_Y, 1.0, m.ink, 0.04, picY, picZ, { cast: false });
  box(0.12, 10 / PX_Y, 0.75, m.pictureSky, 0.06, picY, picZ, { cast: false });
  box(0.14, 4 / PX_Y, 0.75, m.pictureLeaf, 0.07, picY - 3 / PX_Y, picZ, {
    cast: false,
  });
  box(0.16, 2 / PX_Y, 0.25, m.cloud, 0.08, picY + 2 / PX_Y, picZ, {
    cast: false,
  });

  // Window: ink frame around the opening, a cross bar, a sill.
  const winX = (winX0 + winX1) / 2;
  const winY = (winTop + winBot) / 2;
  const winW = winX1 - winX0;
  const winH = winTop - winBot;
  box(winW + 0.2, 0.1, 0.06, m.ink, winX, winTop + 0.05, 0.03, {
    cast: false,
  });
  box(winW + 0.2, 0.1, 0.06, m.ink, winX, winBot - 0.05, 0.03, {
    cast: false,
  });
  box(0.1, winH, 0.06, m.ink, winX0 - 0.05, winY, 0.03, { cast: false });
  box(0.1, winH, 0.06, m.ink, winX1 + 0.05, winY, 0.03, { cast: false });
  box(0.12, winH, 0.06, m.ink, 41 / (TW / 2), winY, -T / 2, { cast: false });
  box(winW, 0.06, 0.06, m.ink, winX, WH - 21 / PX_Y, -T / 2, { cast: false });
  box(winW + 0.5, 0.1, 0.24, m.trim, winX, winBot - 0.15, 0.12);
  box(winW + 0.5, 0.05, 0.2, m.skirting, winX, winBot - 0.225, 0.1, {
    cast: false,
  });

  // Outside the window: sky, a lighter band low down, two drifting clouds.
  const skyZ = -0.55;
  const skyGeo = new PlaneGeometry(3.4, 2.6);
  geos.push(skyGeo);
  const sky = new Mesh(skyGeo, m.sky);
  sky.position.set(2.0, 1.2, skyZ);
  scene.add(sky);
  box(3.4, 0.7, 0.02, m.skyLow, 2.0, 0.55, skyZ + 0.02, { cast: false });
  const clouds: { group: Group; speed: number; from: number; to: number }[] =
    [];
  const cloud = (x: number, y: number, speed: number) => {
    const g = new Group();
    g.position.set(x, y, skyZ + 0.1);
    box(0.55, 0.16, 0.04, m.cloud, 0, 0, 0, { parent: g, cast: false });
    box(0.32, 0.26, 0.04, m.cloud, 0.05, 0.08, 0, { parent: g, cast: false });
    box(0.2, 0.2, 0.04, m.cloud, -0.2, 0.05, 0, { parent: g, cast: false });
    scene.add(g);
    clouds.push({ group: g, speed, from: 0.3, to: 3.9 });
  };
  cloud(1.4, 1.75, 0.09);
  cloud(3.0, 1.25, 0.06);

  // Rug across the middle four tiles: border, field, inner ring.
  const rugC = 2.5;
  box(2.0, 0.03, 2.0, m.rugLine, rugC, 0.015, rugC, { cast: false });
  box(1.72, 0.035, 1.72, m.rug, rugC, 0.02, rugC, { cast: false });
  box(1.24, 0.04, 1.24, m.rugLine, rugC, 0.025, rugC, { cast: false });
  box(1.08, 0.045, 1.08, m.rug, rugC, 0.03, rugC, { cast: false });

  // Doormat inside the door.
  box(0.76, 0.03, 0.76, m.ink, 0.5, 0.015, 2.5, { cast: false });
  box(0.62, 0.035, 0.62, m.crateDark, 0.5, 0.02, 2.5, { cast: false });
  box(0.3, 0.04, 0.3, m.crate, 0.5, 0.025, 2.5, { cast: false });

  // Reception counter on tiles (1,1) and (2,1), a ledger and a bell on top,
  // and the receptionist behind it. Keep `BLOCKED` in lobby-cast.tsx in step.
  const deskH = 14 / PX_Y;
  box(1.9, deskH - 0.08, 0.9, m.crate, 2, (deskH - 0.08) / 2, 1.5);
  box(2.0, 0.08, 1.0, m.crateLight, 2, deskH - 0.04, 1.5);
  box(0.36, 0.06, 0.28, m.brass, 1.55, deskH + 0.03, 1.42);
  box(0.36, 0.015, 0.02, m.ink, 1.55, deskH + 0.06, 1.42, { cast: false });
  const bellGeo = faceted(new IcosahedronGeometry(0.11, 1));
  geos.push(bellGeo);
  const bell = new Mesh(bellGeo, m.brass);
  bell.position.set(2.5, deskH + 0.1, 1.5);
  bell.castShadow = true;
  scene.add(bell);

  // A potted plant in the far corner: pot, stem, six faceted tufts.
  const plant = new Group();
  plant.position.set(5.5, 0, 0.5);
  scene.add(plant);
  const potGeo = new CylinderGeometry(0.24, 0.19, 0.42, 8);
  geos.push(potGeo);
  const pot = new Mesh(potGeo, m.crateDark);
  pot.position.y = 0.21;
  pot.castShadow = true;
  pot.receiveShadow = true;
  plant.add(pot);
  const rimGeo = new CylinderGeometry(0.26, 0.26, 0.07, 8);
  geos.push(rimGeo);
  const rim = new Mesh(rimGeo, m.crateLight);
  rim.position.y = 0.42;
  rim.castShadow = true;
  plant.add(rim);
  const leaves = new Group();
  leaves.position.y = 0.42;
  plant.add(leaves);
  box(0.06, 0.4, 0.06, m.leafDark, 0, 0.2, 0, { parent: leaves });
  const tufts: [number, number, number, number, Material][] = [
    [-0.22, 0.42, 0.06, 0.2, m.leafDark],
    [0.24, 0.5, -0.04, 0.2, m.leafDark],
    [0.0, 0.72, 0.0, 0.24, m.leafDark],
    [-0.14, 0.5, 0.16, 0.16, m.leaf],
    [0.18, 0.62, 0.14, 0.16, m.leaf],
    [0.0, 0.86, 0.1, 0.19, m.leaf],
  ];
  for (const [x, y, z, r, mat] of tufts) {
    const geo = faceted(new IcosahedronGeometry(r, 0));
    geos.push(geo);
    const tuft = new Mesh(geo, mat);
    tuft.position.set(x, y, z);
    tuft.castShadow = true;
    leaves.add(tuft);
  }

  // A crate up front, with plank lines and a nail.
  const crateH = 12 / PX_Y;
  box(0.86, crateH - 0.05, 0.86, m.crate, 0.5, (crateH - 0.05) / 2, 4.5);
  box(0.86, 0.05, 0.86, m.crateLight, 0.5, crateH - 0.025, 4.5);
  box(0.9, 0.03, 0.9, m.crateDark, 0.5, crateH * 0.36, 4.5, { cast: false });
  box(0.9, 0.03, 0.9, m.crateDark, 0.5, crateH * 0.7, 4.5, { cast: false });
  box(0.03, 0.03, 0.03, m.ink, 0.5, crateH + 0.01, 4.5, { cast: false });

  // ---- Light: from above and the front-left, so tops are brightest, the
  // right wall and +z faces are lit, and +x faces fall into shade.
  scene.add(new AmbientLight(0xffffff, 2.2));
  const sun = new DirectionalLight(0xfff4e6, 2.2);
  sun.position.set(3 + 0.35 * 10, 10, 3 + 0.8 * 10);
  sun.target.position.set(3, 0, 3);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.03;

  // ---- Targets and the outline pass.
  const depthTex = new DepthTexture(ROOM_W, ROOM_H);
  const colorRT = track(
    new WebGLRenderTarget(ROOM_W, ROOM_H, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthTexture: depthTex,
      generateMipmaps: false,
    }),
  );
  const normalRT = track(
    new WebGLRenderTarget(ROOM_W, ROOM_H, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
    }),
  );
  const normalMat = track(new MeshNormalMaterial());
  const postMat = track(
    new ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: colorRT.texture },
        tDepth: { value: depthTex },
        tNormal: { value: normalRT.texture },
        texel: { value: new Vector2(1 / ROOM_W, 1 / ROOM_H) },
        ink: { value: new Color(p.ink) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  const quadGeo = new PlaneGeometry(2, 2);
  geos.push(quadGeo);
  const postScene = new Scene();
  postScene.add(new Mesh(quadGeo, postMat));
  const postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const c of clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > c.to) c.group.position.x = c.from;
    }
    leaves.rotation.z = Math.sin(now / 1400) * 0.04;
    leaves.rotation.x = Math.cos(now / 1900) * 0.03;
    renderer.setRenderTarget(colorRT);
    renderer.render(scene, camera);
    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(normalRT);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  };

  let playing = false;
  const setPlaying = (next: boolean) => {
    if (!animate) return;
    if (next === playing) return;
    playing = next;
    if (next) {
      last = performance.now();
      renderer.setAnimationLoop(frame);
    } else {
      renderer.setAnimationLoop(null);
    }
  };

  frame(performance.now());

  return {
    setPlaying,
    dispose() {
      renderer.setAnimationLoop(null);
      for (const g of geos) g.dispose();
      for (const d of disposables) d.dispose();
      depthTex.dispose();
    },
  };
}
