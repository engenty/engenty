// Regenerates the Engenty favicon set from the in-app BlobAvatar
// (packages/ui-core/src/components/blob-avatar). Renders the faithful CSS
// reproduction in blob-avatar-page.mjs with headless Chromium (Playwright),
// then assembles rasters + the animated APNG with ffmpeg.
//
//   node apps/ui/scripts/favicons/generate-favicons.mjs
//
// Requires: @playwright/test (with chromium installed) + ffmpeg on PATH.
// Writes the eight production assets into apps/ui/public/. The animated APNG
// cycles all five characters (ember, pilot, scribe, beam, hum); the static
// SVG/PNG/ICO show the at-rest ember (character 0), matching the brand
// theme-color. Tune the loop with env vars N (frames) and APNG_PX (size).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  blobHtml,
  CHARACTER_RADII,
  maskableHtml,
  STAGE,
} from "./blob-avatar-page.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "../../public");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-favicons-"));
const FRAMES = path.join(WORK, "frames");
fs.mkdirSync(FRAMES, { recursive: true });

const LOOP = 8000;
const N = Number(process.env.N || 72); // frames over the 8s loop (~9fps)
const APNG_PX = Number(process.env.APNG_PX || 40); // favicons display <=32px

// ---- border-radius -> SVG path (exact, incl. CSS overflow scaling §5) ----
function radiusPath(spec, W, H) {
  const [hPart, vPart] = spec.includes("/") ? spec.split("/") : [spec, spec];
  const parse = (str) =>
    str
      .trim()
      .split(/\s+/)
      .map((v) => Number.parseFloat(v) / 100);
  const expand = (vals) => {
    if (vals.length === 1) {
      return [vals[0], vals[0], vals[0], vals[0]];
    }
    if (vals.length === 2) {
      return [vals[0], vals[1], vals[0], vals[1]];
    }
    if (vals.length === 3) {
      return [vals[0], vals[1], vals[2], vals[1]];
    }
    return vals.slice(0, 4);
  };
  const h = expand(parse(hPart)).map((f) => f * W); // TL TR BR BL horizontal
  const v = expand(parse(vPart)).map((f) => f * H); // TL TR BR BL vertical
  const f = Math.min(
    1,
    W / (h[0] + h[1]), // top
    W / (h[3] + h[2]), // bottom
    H / (v[0] + v[3]), // left
    H / (v[1] + v[2]) // right
  );
  for (let i = 0; i < 4; i++) {
    h[i] *= f;
    v[i] *= f;
  }
  const r = (x) => x.toFixed(2);
  return [
    `M${r(h[0])} 0`,
    `H${r(W - h[1])}`,
    `A${r(h[1])} ${r(v[1])} 0 0 1 ${r(W)} ${r(v[1])}`,
    `V${r(H - v[2])}`,
    `A${r(h[2])} ${r(v[2])} 0 0 1 ${r(W - h[2])} ${r(H)}`,
    `H${r(h[3])}`,
    `A${r(h[3])} ${r(v[3])} 0 0 1 0 ${r(H - v[3])}`,
    `V${r(v[0])}`,
    `A${r(h[0])} ${r(v[0])} 0 0 1 ${r(h[0])} 0`,
    "Z",
  ].join(" ");
}

// Static ember favicon.svg — dark-mode aware. Box 56x48 centered in STAGE,
// tightly framed so the blob fills the icon (matches the raster/APNG framing).
function faviconSvg() {
  const d = radiusPath(CHARACTER_RADII[0], 56, 48);
  const bx = (STAGE - 56) / 2; // box left
  const by = (STAGE - 48) / 2; // box top
  const right = bx + 56;
  const ex = bx + 16; // eye 24x24 centered in the 56x48 box
  const ey = by + 12;
  return `<svg viewBox="0 0 ${STAGE} ${STAGE}" xmlns="http://www.w3.org/2000/svg">
  <title>Engenty</title>
  <style>
    .body{fill:#e0531b}.ring{fill:none;stroke:#fdfdfd;stroke-width:1.8}.pupil{fill:#fdfdfd}
    .bub{fill:#e0531b}
    @media (prefers-color-scheme: dark){
      .body{fill:#f07040}.ring{stroke:rgba(255,255,255,.88)}.pupil{fill:rgba(255,255,255,.88)}
      .bub{fill:#f07040}
    }
  </style>
  <g transform="translate(${bx} ${by})"><path class="body" d="${d}"/></g>
  <circle class="bub" cx="${right - 2}" cy="${by}" r="4" opacity=".6"/>
  <circle class="bub" cx="${right - 11}" cy="${by - 5}" r="3" opacity=".35"/>
  <g transform="translate(${ex} ${ey})">
    <circle class="ring" cx="12" cy="11" r="5.2"/>
    <circle class="pupil" cx="12" cy="11" r="2.2"/>
  </g>
</svg>
`;
}

const ff = (args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const pub = (name) => path.join(PUBLIC, name);

const browser = await chromium.launch();
try {
  // 1) Static ember master @512, then downscale the raster variants.
  const master = path.join(WORK, "ember-512.png");
  const ctx = await browser.newContext({
    deviceScaleFactor: 512 / STAGE,
    viewport: { width: STAGE, height: STAGE },
  });
  const page = await ctx.newPage();
  await page.setContent(blobHtml({ box: 56 }), { waitUntil: "load" });
  await page.evaluate(() => window.__freeze());
  await page.evaluate(() => window.__sample(0)); // at-rest ember
  await page.screenshot({ path: master, omitBackground: true });
  await ctx.close();

  const scale = (size, dst) =>
    ff(["-i", master, "-vf", `scale=${size}:${size}:flags=lanczos`, dst]);
  scale(512, pub("icon-512.png"));
  scale(192, pub("icon-192.png"));
  scale(180, pub("apple-touch-icon.png"));
  const ember32 = path.join(WORK, "ember-32.png");
  scale(32, ember32);
  ff(["-i", ember32, pub("favicon.ico")]);

  // 2) Maskable icons — full-bleed brand square + centered eye (safe zone).
  for (const size of [192, 512]) {
    const mctx = await browser.newContext({
      viewport: { width: size, height: size },
    });
    const mpage = await mctx.newPage();
    await mpage.setContent(maskableHtml({ box: size }), { waitUntil: "load" });
    await mpage.screenshot({ path: pub(`icon-maskable-${size}.png`) });
    await mctx.close();
  }

  // 3) Static ember favicon.svg (dark-mode aware).
  fs.writeFileSync(pub("favicon.svg"), faviconSvg());

  // 4) Animated APNG — cycle all five characters. Deterministic WAAPI sampling
  //    keeps the loop seamless regardless of capture speed.
  const actx = await browser.newContext({
    deviceScaleFactor: APNG_PX / STAGE,
    viewport: { width: STAGE, height: STAGE },
  });
  const apage = await actx.newPage();
  await apage.setContent(blobHtml({ box: 56, loopMs: LOOP }), {
    waitUntil: "load",
  });
  await apage.evaluate(() => window.__freeze());
  for (let i = 0; i < N; i++) {
    await apage.evaluate((t) => window.__sample(t), (i / N) * LOOP);
    await apage.screenshot({
      path: path.join(FRAMES, `f${String(i).padStart(3, "0")}.png`),
      omitBackground: true,
    });
  }
  await actx.close();
  ff([
    "-framerate",
    String(1000 / (LOOP / N)),
    "-i",
    path.join(FRAMES, "f%03d.png"),
    "-plays",
    "0",
    "-f",
    "apng",
    pub("favicon.apng"),
  ]);
} finally {
  await browser.close();
  fs.rmSync(WORK, { recursive: true, force: true });
}

console.log("favicons written ->", PUBLIC);
