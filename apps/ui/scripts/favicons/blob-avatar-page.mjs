// Faithful standalone reproduction of the in-app BlobAvatar
// (packages/ui-core/src/components/blob-avatar). Colors, silhouettes, eye
// geometry, accents and keyframes are copied verbatim from source. All motion
// runs as CSS animations driven through the Web Animations API so the render
// script can pause + sample currentTime deterministically (seamless APNG loop;
// sample(0) == clean at-rest ember for static assets). Tailwind utilities are
// inlined as raw px (1 unit = 4px), scaled off the native 56px-wide box.

export const CHARACTER_COLORS = [
  "#e0531b",
  "#3358d4",
  "#e08c0b",
  "#1e7d49",
  "#d23b5e",
];
export const CHARACTER_RADII = [
  "48% 52% 34% 36% / 72% 70% 30% 32%", // 0 ember  — pear
  "50%", // 1 pilot  — circle
  "50% 50% 48% 48% / 70% 70% 30% 30%", // 2 scribe — egg
  "54% 46% 48% 52% / 88% 86% 14% 12%", // 3 beam   — droplet
  "48% 52% 50% 50% / 38% 36% 64% 62%", // 4 hum    — squat
];
const EYE = "#fdfdfd"; // primary-foreground = oklch(99% 0 0)

// Tight square canvas (px, in native box units) around the 56x48 blob. Sized
// so the blob fills ~82% of the icon — favicons render at 16-32px, so a padded
// frame reads as a tiny mark lost in whitespace. Accents are pulled in to fit.
export const STAGE = 68;

export function blobHtml({ box = 56, loopMs = 8000 } = {}) {
  const s = box / 56;
  const p = (n) => `${(n * s).toFixed(3)}px`;
  const C = CHARACTER_COLORS;
  const R = CHARACTER_RADII;
  // blob-cycle: hold each character, then a quick morph to the next.
  const cycle = `@keyframes blob-cycle{
    0%{border-radius:${R[0]};background:${C[0]}}
    14%{border-radius:${R[0]};background:${C[0]}}
    20%{border-radius:${R[1]};background:${C[1]}}
    34%{border-radius:${R[1]};background:${C[1]}}
    40%{border-radius:${R[2]};background:${C[2]}}
    54%{border-radius:${R[2]};background:${C[2]}}
    60%{border-radius:${R[3]};background:${C[3]}}
    74%{border-radius:${R[3]};background:${C[3]}}
    80%{border-radius:${R[4]};background:${C[4]}}
    94%{border-radius:${R[4]};background:${C[4]}}
    100%{border-radius:${R[0]};background:${C[0]}}
  }`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  .stage{width:${p(STAGE)};height:${p(STAGE)};display:flex;align-items:center;justify-content:center}
  @keyframes blob-wobble{0%,100%{transform:scaleX(1) scaleY(1) rotate(0deg)}25%{transform:scaleX(1.06) scaleY(.94) rotate(-1.5deg)}50%{transform:scaleX(.96) scaleY(1.04) rotate(.5deg)}75%{transform:scaleX(1.04) scaleY(.95) rotate(1.5deg)}}
  @keyframes blob-eye-drift{0%,18%,100%{transform:translate(0,0)}24%,38%{transform:translate(2.2px,-1.4px)}44%,60%{transform:translate(-2px,1px)}66%,82%{transform:translate(1.2px,1.8px)}88%{transform:translate(-1px,-1.6px)}}
  @keyframes blob-eye-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
  @keyframes blob-bubble-float{0%,100%{transform:translateY(0);opacity:.9}50%{transform:translateY(${p(-2.5)});opacity:.55}}
  @keyframes blob-wave-pulse{0%,100%{opacity:.35;transform:translateX(-50%) scale(.94)}50%{opacity:.9;transform:translateX(-50%) scale(1.06)}}
  @keyframes blob-ray-pulse{0%,100%{opacity:.85;transform:scaleX(1)}50%{opacity:.4;transform:scaleX(.6)}}
  ${cycle}
  .blob{position:relative;display:flex;align-items:center;justify-content:center;
    width:${p(56)};height:${p(48)};background:${C[0]};color:${EYE};border-radius:${R[0]};
    animation:blob-cycle ${loopMs}ms linear infinite, blob-wobble 2000ms ease-in-out infinite}
  .eye{width:${p(24)};height:${p(24)};flex-shrink:0}
  .lid{transform-origin:center;animation:blob-eye-blink 8000ms ease-in-out infinite}
  .pupil{animation:blob-eye-drift 4000ms ease-in-out infinite}
  .acc{position:absolute;inset:0;pointer-events:none}
  .variant{position:absolute;inset:0;display:none}
  .bub{position:absolute;border-radius:9999px;background:var(--acc);animation:blob-bubble-float 2000ms ease-in-out infinite}
  .b1{top:${p(-4)};right:${p(-2)};width:${p(8)};height:${p(8)};opacity:.6}
  .b2{top:${p(-8)};right:${p(8)};width:${p(6)};height:${p(6)};opacity:.35;animation-delay:-1000ms}
  .dot{position:absolute;top:${p(-5)};right:${p(2)};width:${p(8)};height:${p(8)};border-radius:9999px;background:var(--acc);opacity:.7}
  .ray{position:absolute;border-radius:9999px;background:var(--acc);animation:blob-ray-pulse 2500ms ease-in-out infinite}
  .rayL{top:50%;left:${p(-5)};height:${p(2)};width:${p(6)};transform-origin:right}
  .rayR{top:50%;right:${p(-5)};height:${p(2)};width:${p(6)};transform-origin:left}
  .rayT{top:${p(-6)};left:50%;height:${p(6)};width:${p(2)};transform:translateX(-50%)}
  .waves{position:absolute;top:${p(-9)};left:50%;transform:translateX(-50%);width:${p(20)};color:var(--acc);animation:blob-wave-pulse 2000ms ease-in-out infinite}
  </style></head><body>
  <div class="stage"><div class="blob" id="blob" style="--acc:${C[0]}">
    <span class="acc" id="acc">
      <span class="variant" data-c="0"><span class="bub b1"></span><span class="bub b2"></span></span>
      <span class="variant" data-c="1"><span class="bub b1"></span><span class="bub b2"></span></span>
      <span class="variant" data-c="2"><span class="dot"></span></span>
      <span class="variant" data-c="3"><span class="ray rayL"></span><span class="ray rayR"></span><span class="ray rayT"></span></span>
      <span class="variant" data-c="4"><svg class="waves" viewBox="0 0 28 12" fill="none"><path d="M6 10c4.8-4.4 11.2-4.4 16 0" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path d="M9.5 4.5c2.8-2.4 6.2-2.4 9 0" opacity=".6" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/></svg></span>
    </span>
    <svg class="eye" viewBox="0 0 24 24" fill="none"><g class="lid"><circle cx="12" cy="11" r="5.2" stroke="currentColor" stroke-width="1.8"/><g class="pupil"><circle cx="12" cy="11" r="2.2" fill="currentColor"/></g></g></svg>
  </div></div>
  <script>
    const COLORS=${JSON.stringify(C)};
    const LOOP=${loopMs};
    const blob=document.getElementById('blob');
    const variants=[...document.querySelectorAll('.variant')];
    // Accent set matches the character the cycle is *holding* at time t.
    function charAt(t){const x=(t%LOOP)/LOOP*5;let c=Math.floor(x);return c%5;}
    function showChar(c){variants.forEach(v=>{v.style.display=(+v.dataset.c===c)?'block':'none';});
      blob.style.setProperty('--acc',COLORS[c]);}
    window.__freeze=()=>document.getAnimations().forEach(a=>{a.pause();});
    window.__sample=(t)=>{document.getAnimations().forEach(a=>{
      const d=a.effect.getComputedTiming().duration;a.currentTime=t%d;});
      showChar(charAt(t));};
    showChar(0);
  </script>
  </body></html>`;
}

export function maskableHtml({ bg = "#e0531b", box = 512 } = {}) {
  // Full-bleed brand square + centered white eye within the safe zone.
  const eye = Math.round(box * 0.5);
  const stroke = (eye / 24) * 1.8;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0}
  .m{width:${box}px;height:${box}px;background:${bg};display:flex;align-items:center;justify-content:center}
  svg{width:${eye}px;height:${eye}px}
  </style></head><body><div class="m">
  <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5.2" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2" fill="#fff"/></svg>
  </div></body></html>`;
}
