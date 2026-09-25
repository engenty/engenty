/** Room canvas size and the isometric tile grid, in 1× pixels. Shared by the
 *  canvas painter (client) and the pages that stand engenties on tiles. */
export const ROOM_W = 240;
export const ROOM_H = 168;
/** Floor origin: the top corner of tile (0, 0). */
export const OX = 120;
export const OY = 60;
export const TW = 32;
export const TH = 16;
export const WALL_H = 56;
export const TILES = 6;

/** Screen position of the centre of tile (i, j). */
export function tileCenter(i: number, j: number): { x: number; y: number } {
  return {
    x: OX + ((i - j) * TW) / 2,
    y: OY + ((i + j) * TH) / 2 + TH / 2,
  };
}

/** Where to put a flat engenty so its feet stand on tile (i, j). Everything
 *  is a percentage of the room so the cast scales with it; `size` is the
 *  mark's box at the room's full (`scale`×) width. */
export function standOn(
  i: number,
  j: number,
  size: number,
  scale: number
): { left: string; top: string; width: string } {
  const c = tileCenter(i, j);
  const w = (size / (ROOM_W * scale)) * 100;
  const h = (size / (ROOM_H * scale)) * 100;
  return {
    left: `${(c.x / ROOM_W) * 100 - w / 2}%`,
    top: `${(c.y / ROOM_H) * 100 - h * 0.9}%`,
    width: `${w}%`,
  };
}

/** A chat bubble hanging over the head of the engenty on tile (i, j); its
 *  tail (22px from the bubble's left edge) points at the mark. */
export function speakFrom(
  i: number,
  j: number,
  size: number,
  scale: number
): { left: string; bottom: string } {
  const c = tileCenter(i, j);
  const h = (size / (ROOM_H * scale)) * 100;
  return {
    left: `calc(${(c.x / ROOM_W) * 100}% - 28px)`,
    bottom: `calc(${100 - (c.y / ROOM_H) * 100 + h * 0.95}% + 12px)`,
  };
}
