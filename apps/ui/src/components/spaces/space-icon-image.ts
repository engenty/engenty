/**
 * Space tile uploads are stored as a small JPEG data URL on `spaces.icon`.
 *
 * Dedicated object storage (Phase 6b) is the long-term home for bytes; a 96px
 * square is small enough to live on the text column so Upload works now, and
 * `isSpaceImageIcon` already accepts http(s) URLs when that storage lands.
 */
export const SPACE_ICON_IMAGE_MAX_CHARS = 24_000;
const TILE_PX = 96;

export async function spaceIconFromImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("not-image");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const size = Math.min(bitmap.width, bitmap.height);
    const sx = Math.round((bitmap.width - size) / 2);
    const sy = Math.round((bitmap.height - size) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = TILE_PX;
    canvas.height = TILE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas");
    }
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, TILE_PX, TILE_PX);
    for (const quality of [0.82, 0.7, 0.55]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= SPACE_ICON_IMAGE_MAX_CHARS) {
        return dataUrl;
      }
    }
    throw new Error("too-large");
  } finally {
    bitmap.close();
  }
}
