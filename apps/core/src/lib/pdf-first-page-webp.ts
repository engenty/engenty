import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";

const require = createRequire(import.meta.url);

const MAX_THUMB_PX = 240;
const WEBP_QUALITY = 78;
const RENDER_SCALE_CAP = 2.5;

let pdfWorkerConfigured = false;

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfWorkerConfigured) {
    const workerPath = require.resolve("pdfjs-dist/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

/**
 * Rasterize the first page of a PDF to a small WebP suitable for list thumbnails.
 */
export async function renderPdfFirstPageWebp(
  pdfBytes: Uint8Array
): Promise<Uint8Array> {
  const pdfjs = await getPdfjs();
  const copy = new Uint8Array(pdfBytes);
  const loadingTask = pdfjs.getDocument({
    data: copy,
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const baseVp = page.getViewport({ scale: 1 });
  const fitScale = Math.min(
    MAX_THUMB_PX / baseVp.width,
    MAX_THUMB_PX / baseVp.height,
    RENDER_SCALE_CAP
  );
  const viewport = page.getViewport({ scale: Math.max(fitScale, 0.1) });
  const w = Math.max(1, Math.floor(viewport.width));
  const h = Math.max(1, Math.floor(viewport.height));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const renderTask = page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  });
  await renderTask.promise;
  const png = canvas.toBuffer("image/png");
  const out = await sharp(png)
    .resize({ width: MAX_THUMB_PX, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return new Uint8Array(out);
}
