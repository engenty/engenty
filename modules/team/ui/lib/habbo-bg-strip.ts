/**
 * Strip light / white backgrounds and near-white edge halos from Gemini Habbo
 * avatars. Runs in the browser via canvas ImageData.
 */

const LIGHT_LUMA = 232;
const FRINGE_LUMA = 210;

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightBackground(
  r: number,
  g: number,
  b: number,
  a: number
): boolean {
  if (a < 8) {
    return true;
  }
  // Near-white / light-grey (incl. soft checkerboard tiles)
  const L = luma(r, g, b);
  if (L < LIGHT_LUMA) {
    return false;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Low saturation light pixels = background, not clothing highlights
  return max - min < 28;
}

function isFringeHalo(r: number, g: number, b: number, a: number): boolean {
  if (a < 40) {
    return true;
  }
  const L = luma(r, g, b);
  if (L < FRINGE_LUMA) {
    return false;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 40;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode avatar image"));
    img.src = dataUrl;
  });
}

/**
 * Flood-fill remove light background from borders, then erode white fringe
 * artefacts that Gemini often leaves around black outlines.
 * Returns a cropped, transparent PNG data URL on a padded square canvas.
 */
export async function stripHabboLightBackground(
  dataUrl: string,
  opts?: { canvasSize?: number; pad?: number }
): Promise<string> {
  const canvasSize = opts?.canvasSize ?? 256;
  const pad = opts?.pad ?? 8;

  const img = await loadImage(dataUrl);
  const src = document.createElement("canvas");
  src.width = img.naturalWidth || img.width;
  src.height = img.naturalHeight || img.height;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) {
    throw new Error("Canvas unavailable");
  }
  sctx.drawImage(img, 0, 0);
  const { width, height } = src;
  const imageData = sctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const i = y * width + x;
    if (visited[i]) {
      return;
    }
    visited[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length > 0) {
    const i = queue.pop()!;
    const o = i * 4;
    const r = data[o]!;
    const g = data[o + 1]!;
    const b = data[o + 2]!;
    const a = data[o + 3]!;
    if (!isLightBackground(r, g, b, a)) {
      continue;
    }
    data[o + 3] = 0;
    const x = i % width;
    const y = Math.floor(i / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  // Two passes of fringe erosion: near-white pixels touching transparency
  for (let pass = 0; pass < 2; pass++) {
    const toClear: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const o = i * 4;
        if (data[o + 3]! === 0) {
          continue;
        }
        if (!isFringeHalo(data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!)) {
          continue;
        }
        let touchesTransparent = false;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            touchesTransparent = true;
            break;
          }
          if (data[(ny * width + nx) * 4 + 3]! === 0) {
            touchesTransparent = true;
            break;
          }
        }
        if (touchesTransparent) {
          toClear.push(o);
        }
      }
    }
    for (const o of toClear) {
      data[o + 3] = 0;
    }
  }

  sctx.putImageData(imageData, 0, 0);

  // Content bbox
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }
  }

  const out = document.createElement("canvas");
  out.width = canvasSize;
  out.height = canvasSize;
  const octx = out.getContext("2d");
  if (!octx) {
    throw new Error("Canvas unavailable");
  }
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0, 0, canvasSize, canvasSize);

  if (maxX >= minX && maxY >= minY) {
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const avail = canvasSize - pad * 2;
    const scale = Math.min(avail / cw, avail / ch);
    const dw = Math.max(1, Math.round(cw * scale));
    const dh = Math.max(1, Math.round(ch * scale));
    const dx = Math.floor((canvasSize - dw) / 2);
    const dy = Math.floor((canvasSize - dh) / 2);
    octx.drawImage(src, minX, minY, cw, ch, dx, dy, dw, dh);
  }

  return out.toDataURL("image/png");
}
