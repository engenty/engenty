"use client";

import { useEffect, useRef } from "react";

/**
 * A Habbo room as pixel art: two wallpapered walls meeting in a corner, an
 * isometric tiled floor, a door, a window, a rug and a crate. Drawn on a
 * canvas at 1× and scaled with `image-rendering: pixelated`, so every pixel
 * is a real pixel. The smooth engenties stand on top of it as HTML — the
 * vector cast against the pixel world.
 */
import {
  OX,
  OY,
  ROOM_H,
  ROOM_W,
  TH,
  TILES,
  TW,
  tileCenter,
  WALL_H,
} from "./pixel-room-geometry";

export interface RoomPalette {
  cloud: string;
  crate: string;
  crateDark: string;
  crateLight: string;
  door: string;
  doorLight: string;
  floor: string;
  floorAlt: string;
  floorLine: string;
  ink: string;
  leaf: string;
  leafDark: string;
  rug: string;
  rugLine: string;
  skirting: string;
  sky: string;
  skyLow: string;
  wall: string;
  wallDark: string;
  wallLight: string;
  wallLine: string;
  /** The right wall is lit by its window: a touch lighter. */
  wallLit: string;
  wallLitDark: string;
}

export const EMBER_ROOM: RoomPalette = {
  wall: "#7a2f1c",
  wallDark: "#5e2313",
  wallLine: "#8a3a26",
  wallLit: "#8d3a24",
  wallLitDark: "#6c2a18",
  wallLight: "#b8623f",
  skirting: "#3a160c",
  floor: "#a94a2e",
  floorAlt: "#b5563a",
  floorLine: "#7c3320",
  rug: "#f0cf8c",
  rugLine: "#c9a15c",
  ink: "#1d120e",
  sky: "#7fb8e6",
  skyLow: "#bfe0f5",
  cloud: "#ffffff",
  door: "#4a2314",
  doorLight: "#6b3520",
  crate: "#c98b4a",
  crateLight: "#e8b06c",
  crateDark: "#9a6432",
  leaf: "#3f8f3a",
  leafDark: "#2b6a2a",
};

function diamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  const half = h / 2;
  for (let r = 0; r < h; r++) {
    const t = r < half ? r + 1 : h - r;
    const hw = (t * w) / h;
    ctx.fillRect(Math.round(cx - hw), top + r, Math.round(hw * 2), 1);
  }
}

/** Where the wall column `d` along a wall starts on screen. */
function wallColumn(
  x0: number,
  y0: number,
  d: number,
  dir: -1 | 1
): { x: number; top: number } {
  return {
    x: dir < 0 ? x0 - d - 2 : x0 + d,
    top: y0 - WALL_H + Math.floor((d + 2) / 2),
  };
}

/**
 * A wall panel going down-left (dir=-1) or down-right (dir=+1) from (x0,y0):
 * dotted wallpaper above a dado rail, panelling below it, a skirting board.
 */
function wall(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  length: number,
  dir: -1 | 1,
  p: RoomPalette
) {
  const base = dir < 0 ? p.wall : p.wallLit;
  const panel = dir < 0 ? p.wallDark : p.wallLitDark;
  const rail = WALL_H - 22;
  for (let d = 0; d < length; d += 2) {
    const { x, top } = wallColumn(x0, y0, d, dir);
    ctx.fillStyle = base;
    ctx.fillRect(x, top, 2, WALL_H);
    // Wallpaper: a dot every 8 px, rows staggered.
    const row = (d / 2) % 4 < 2 ? 4 : 8;
    ctx.fillStyle = p.wallLine;
    for (let y = row; y < rail - 2; y += 8) {
      ctx.fillRect(x, top + y, 1, 1);
    }
    // Dado rail and the panelling under it.
    ctx.fillStyle = p.wallLight;
    ctx.fillRect(x, top + rail, 2, 1);
    ctx.fillStyle = panel;
    ctx.fillRect(x, top + rail + 1, 2, WALL_H - rail - 5);
    if (d % 12 === 0) {
      ctx.fillStyle = p.skirting;
      ctx.fillRect(x, top + rail + 3, 1, WALL_H - rail - 9);
    }
    // Skirting board along the floor edge, with a highlight.
    ctx.fillStyle = p.skirting;
    ctx.fillRect(x, top + WALL_H - 4, 2, 4);
    ctx.fillStyle = p.wallLight;
    ctx.fillRect(x, top + WALL_H - 4, 2, 1);
    // Cornice along the top.
    ctx.fillStyle = p.wallLight;
    ctx.fillRect(x, top, 2, 1);
  }
}

/** A rectangle on a wall (door, window): a parallelogram following the wall. */
function wallRect(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  from: number,
  len: number,
  top: number,
  height: number,
  dir: -1 | 1,
  color: string
) {
  ctx.fillStyle = color;
  for (let d = from; d < from + len; d += 2) {
    const c = wallColumn(x0, y0, d, dir);
    ctx.fillRect(c.x, c.top + top, 2, height);
  }
}

/**
 * A box standing on tile (i, j), `along` tiles long towards +i, `h` tall.
 * Tiles along +i step right and down, so the exposed sides are every tile's
 * front-left face and the last tile's front-right face.
 */
function box(
  ctx: CanvasRenderingContext2D,
  i: number,
  j: number,
  along: number,
  h: number,
  colors: { top: string; left: string; right: string },
  p: RoomPalette
) {
  const first = tileCenter(i, j);
  const last = tileCenter(i + along - 1, j);
  for (let k = 0; k < along; k++) {
    const c = tileCenter(i + k, j);
    // Front-left face: from the left vertex down to the bottom vertex.
    for (let d = 0; d < TW / 2; d += 2) {
      ctx.fillStyle = colors.left;
      ctx.fillRect(c.x - TW / 2 + d, c.y + d / 2 - h, 2, h);
    }
  }
  // Front-right face of the last tile: bottom vertex up to the right vertex.
  for (let d = 0; d < TW / 2; d += 2) {
    ctx.fillStyle = colors.right;
    ctx.fillRect(last.x + d, last.y + TH / 2 - d / 2 - h, 2, h);
  }
  // Top: one outlined diamond per tile, then the fills so seams vanish.
  for (let k = 0; k < along; k++) {
    const c = tileCenter(i + k, j);
    diamond(ctx, c.x, c.y - TH / 2 - h, TW, TH, p.ink);
  }
  for (let k = 0; k < along; k++) {
    const c = tileCenter(i + k, j);
    diamond(ctx, c.x, c.y - TH / 2 - h + 1, TW - 4, TH - 2, colors.top);
  }
  // Vertical edges at the three visible corners.
  ctx.fillStyle = p.ink;
  ctx.fillRect(first.x - TW / 2, first.y - h, 1, h);
  ctx.fillRect(last.x, last.y + TH / 2 - h, 1, h);
  ctx.fillRect(last.x + TW / 2 - 1, last.y - h, 1, h);
}

function crate(
  ctx: CanvasRenderingContext2D,
  i: number,
  j: number,
  h: number,
  p: RoomPalette
) {
  box(
    ctx,
    i,
    j,
    1,
    h,
    { top: p.crateLight, left: p.crate, right: p.crateDark },
    p
  );
  const c = tileCenter(i, j);
  // A plank line across the top and a nail.
  ctx.fillStyle = p.crate;
  ctx.fillRect(c.x - 6, c.y - h - 1, 12, 1);
  ctx.fillStyle = p.ink;
  ctx.fillRect(c.x - 1, c.y - h - 1, 1, 1);
}

/** A potted plant on tile (i, j): a small pot with three tufts of leaves. */
function plant(
  ctx: CanvasRenderingContext2D,
  i: number,
  j: number,
  p: RoomPalette
) {
  const c = tileCenter(i, j);
  // Pot: a short box, narrower than the tile.
  const potH = 8;
  ctx.fillStyle = p.ink;
  ctx.fillRect(c.x - 7, c.y - potH - 2, 14, potH + 2);
  ctx.fillStyle = p.crateDark;
  ctx.fillRect(c.x - 6, c.y - potH - 1, 12, potH);
  ctx.fillStyle = p.crate;
  ctx.fillRect(c.x - 6, c.y - potH - 1, 6, potH);
  ctx.fillStyle = p.crateLight;
  ctx.fillRect(c.x - 6, c.y - potH - 1, 12, 2);
  // Leaves: overlapping blobs, darker ones behind.
  const blobs: [number, number, number, string][] = [
    [-6, -16, 5, p.leafDark],
    [6, -18, 5, p.leafDark],
    [0, -24, 6, p.leafDark],
    [-4, -14, 4, p.leaf],
    [5, -15, 4, p.leaf],
    [0, -21, 5, p.leaf],
  ];
  for (const [dx, dy, r, color] of blobs) {
    diamond(ctx, c.x + dx, c.y + dy - r, r * 2 + 2, r * 2, p.ink);
    diamond(ctx, c.x + dx, c.y + dy - r + 1, r * 2 - 2, r * 2 - 2, color);
  }
  // Stem.
  ctx.fillStyle = p.leafDark;
  ctx.fillRect(c.x - 1, c.y - potH - 6, 2, 6);
}

export function drawRoom(ctx: CanvasRenderingContext2D, p: RoomPalette) {
  ctx.clearRect(0, 0, ROOM_W, ROOM_H);
  ctx.imageSmoothingEnabled = false;

  const wallLen = (TILES * TW) / 2;
  // Back-left wall (down-left from the corner) and back-right wall.
  wall(ctx, OX, OY, wallLen, -1, p);
  wall(ctx, OX, OY, wallLen, 1, p);
  // Corner post.
  ctx.fillStyle = p.wallDark;
  ctx.fillRect(OX - 1, OY - WALL_H, 2, WALL_H - 3);

  // Door on the left wall: frame, panel, an inset, a brass knob.
  wallRect(ctx, OX, OY, 26, 26, 8, WALL_H - 12, -1, p.ink);
  wallRect(ctx, OX, OY, 28, 22, 10, WALL_H - 16, -1, p.door);
  wallRect(ctx, OX, OY, 32, 14, 14, 14, -1, p.doorLight);
  wallRect(ctx, OX, OY, 32, 14, 32, 10, -1, p.doorLight);
  wallRect(ctx, OX, OY, 30, 2, 28, 2, -1, p.rug);
  // A picture on the left wall, towards the corner: a little landscape.
  wallRect(ctx, OX, OY, 6, 16, 8, 14, -1, p.ink);
  wallRect(ctx, OX, OY, 8, 12, 10, 10, -1, p.sky);
  wallRect(ctx, OX, OY, 8, 12, 16, 4, -1, p.leaf);
  wallRect(ctx, OX, OY, 12, 4, 12, 2, -1, p.cloud);

  // Window on the right wall: frame, sky with a lighter band and a cloud,
  // cross bars, a sill.
  wallRect(ctx, OX, OY, 22, 38, 6, 32, 1, p.ink);
  wallRect(ctx, OX, OY, 24, 34, 8, 28, 1, p.sky);
  wallRect(ctx, OX, OY, 24, 34, 24, 12, 1, p.skyLow);
  wallRect(ctx, OX, OY, 30, 12, 13, 3, 1, p.cloud);
  wallRect(ctx, OX, OY, 28, 16, 15, 2, 1, p.cloud);
  wallRect(ctx, OX, OY, 40, 2, 8, 28, 1, p.ink);
  for (let d = 24; d < 58; d += 2) {
    const c = wallColumn(OX, OY, d, 1);
    ctx.fillStyle = p.ink;
    ctx.fillRect(c.x, c.top + 21, 2, 1);
  }
  wallRect(ctx, OX, OY, 20, 42, 38, 2, 1, p.wallLight);
  wallRect(ctx, OX, OY, 20, 42, 40, 1, 1, p.skirting);

  // Floor: checkered, back rows first so front tiles overlap the seams.
  for (let s = 0; s < TILES * 2 - 1; s++) {
    for (let i = 0; i < TILES; i++) {
      const j = s - i;
      if (j < 0 || j >= TILES) {
        continue;
      }
      const c = tileCenter(i, j);
      diamond(ctx, c.x, c.y - TH / 2, TW, TH, p.floorLine);
      diamond(
        ctx,
        c.x,
        c.y - TH / 2 + 1,
        TW - 4,
        TH - 2,
        (i + j) % 2 === 0 ? p.floor : p.floorAlt
      );
    }
  }

  // Doormat inside the door.
  const mat = tileCenter(0, 2);
  diamond(ctx, mat.x, mat.y - TH / 2 + 2, TW - 8, TH - 4, p.ink);
  diamond(ctx, mat.x, mat.y - TH / 2 + 3, TW - 12, TH - 6, p.crateDark);
  diamond(ctx, mat.x, mat.y - TH / 2 + 5, TW - 20, TH - 10, p.crate);

  // Rug across four tiles in the middle, with a dotted border.
  const r = tileCenter(2, 2);
  diamond(ctx, r.x, r.y - TH / 2, TW * 2, TH * 2, p.rugLine);
  diamond(ctx, r.x, r.y - TH / 2 + 2, TW * 2 - 8, TH * 2 - 4, p.rug);
  diamond(ctx, r.x, r.y - TH / 2 + 5, TW * 2 - 20, TH * 2 - 10, p.rugLine);
  diamond(ctx, r.x, r.y - TH / 2 + 6, TW * 2 - 24, TH * 2 - 12, p.rug);
  ctx.fillStyle = p.rugLine;
  for (let k = -2; k <= 2; k++) {
    ctx.fillRect(r.x + k * 6 - 1, r.y + TH / 2 - 1, 2, 1);
    ctx.fillRect(r.x + k * 6 - 1, r.y + TH / 2 + 3, 2, 1);
  }

  // Reception counter under the window, a plant in the corner, a crate up
  // front. (Keep `BLOCKED` in lobby-cast.tsx in step with these tiles.)
  box(
    ctx,
    1,
    0,
    2,
    14,
    { top: p.crateLight, left: p.crate, right: p.crateDark },
    p
  );
  const desk = tileCenter(1, 0);
  ctx.fillStyle = p.ink;
  ctx.fillRect(desk.x + 10, desk.y - 14 - 3, 8, 1);
  ctx.fillStyle = p.rug;
  ctx.fillRect(desk.x + 11, desk.y - 14 - 2, 6, 2);
  plant(ctx, 5, 0, p);
  crate(ctx, 0, 4, 12, p);

  // Front edge of the floor: a dark lip so the room sits on the band.
  for (let i = 0; i < TILES; i++) {
    const a = tileCenter(i, TILES - 1);
    const b = tileCenter(TILES - 1, i);
    ctx.fillStyle = p.ink;
    for (let d = 0; d < TW / 2; d += 2) {
      ctx.fillRect(a.x - TW / 2 + d, a.y + d / 2, 2, 3);
      ctx.fillRect(b.x + TW / 2 - d - 2, b.y + d / 2, 2, 3);
    }
  }
}

export function PixelRoom({
  className,
  palette = EMBER_ROOM,
  scale = 3,
}: {
  className?: string;
  palette?: RoomPalette;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) {
      drawRoom(ctx, palette);
    }
  }, [palette]);

  return (
    <canvas
      aria-label="A pixel-art room with a tiled floor"
      className={className}
      height={ROOM_H}
      ref={ref}
      role="img"
      style={{
        width: "100%",
        maxWidth: ROOM_W * scale,
        height: "auto",
        imageRendering: "pixelated",
        display: "block",
      }}
      width={ROOM_W}
    />
  );
}
