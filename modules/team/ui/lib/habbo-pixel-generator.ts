/**
 * Habbo Hotel & Engenty Pixel Avatar Generator
 *
 * - `analyzePhotoForAvatar` — local photo → skin/hair/outfit hints for Gemini.
 * - `renderHabboPixelAvatar` — canvas fallback (offline / tests). Production
 *   team avatars go through POST /api/team/avatars/habbo (Gemini) + client
 *   `stripHabboLightBackground` for white-edge cleanup.
 */

export interface HabboAvatarOptions {
  glasses?: boolean;
  hairColor?: "dark" | "blonde" | "auburn" | "silver" | "ember";
  hairStyle?: "short" | "wavy" | "spiky" | "bob" | "afro";
  outfitColor?: "ember" | "cobalt" | "moss" | "rose" | "amber" | "dark";
  outfitStyle?: "casual" | "suit" | "hoodie" | "engenty";
  skinTone?: "fair" | "medium" | "tan" | "deep";
  variationSeed?: number;
}

export interface PhotoAnalysisResult {
  brightness: number;
  hairColor: "dark" | "blonde" | "auburn" | "silver" | "ember";
  outfitColor: "ember" | "cobalt" | "moss" | "rose" | "amber" | "dark";
  skinTone: "fair" | "medium" | "tan" | "deep";
}

/**
 * Analyzes photo canvas imageData to extract dominant colors for skin tone, hair, and clothing.
 */
export function analyzePhotoForAvatar(
  canvas: HTMLCanvasElement
): PhotoAnalysisResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      skinTone: "medium",
      hairColor: "dark",
      outfitColor: "ember",
      brightness: 128,
    };
  }

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let sampleCount = 0;

  // Center area (face/chest)
  const startX = Math.floor(width * 0.25);
  const endX = Math.floor(width * 0.75);
  const startY = Math.floor(height * 0.2);
  const endY = Math.floor(height * 0.8);

  for (let y = startY; y < endY; y += 4) {
    for (let x = startX; x < endX; x += 4) {
      const idx = (y * width + x) * 4;
      totalR += data[idx];
      totalG += data[idx + 1];
      totalB += data[idx + 2];
      sampleCount++;
    }
  }

  const avgR = sampleCount > 0 ? totalR / sampleCount : 128;
  const avgG = sampleCount > 0 ? totalG / sampleCount : 128;
  const avgB = sampleCount > 0 ? totalB / sampleCount : 128;
  const brightness = (avgR + avgG + avgB) / 3;

  // Determine skin tone based on brightness and warmth
  let skinTone: PhotoAnalysisResult["skinTone"] = "medium";
  if (brightness > 170) {
    skinTone = "fair";
  } else if (brightness > 130) {
    skinTone = "medium";
  } else if (brightness > 90) {
    skinTone = "tan";
  } else {
    skinTone = "deep";
  }

  // Determine outfit color based on RGB dominance
  let outfitColor: PhotoAnalysisResult["outfitColor"] = "ember";
  if (avgR > avgG + 20 && avgR > avgB + 20) {
    outfitColor = "ember";
  } else if (avgB > avgR + 15) {
    outfitColor = "cobalt";
  } else if (avgG > avgR + 15) {
    outfitColor = "moss";
  } else if (brightness < 80) {
    outfitColor = "dark";
  }

  // Top area for hair
  let topR = 0;
  let topG = 0;
  let topB = 0;
  let topCount = 0;
  for (
    let y = Math.floor(height * 0.1);
    y < Math.floor(height * 0.35);
    y += 4
  ) {
    for (let x = startX; x < endX; x += 4) {
      const idx = (y * width + x) * 4;
      topR += data[idx];
      topG += data[idx + 1];
      topB += data[idx + 2];
      topCount++;
    }
  }
  const topAvgR = topCount > 0 ? topR / topCount : 50;
  const topAvgG = topCount > 0 ? topG / topCount : 50;
  const topAvgB = topCount > 0 ? topB / topCount : 50;

  let hairColor: PhotoAnalysisResult["hairColor"] = "dark";
  if (topAvgR > 160 && topAvgG > 140 && topAvgB < 120) {
    hairColor = "blonde";
  } else if (topAvgR > 140 && topAvgG < 100) {
    hairColor = "auburn";
  } else if (topAvgR > 160 && topAvgG > 160 && topAvgB > 160) {
    hairColor = "silver";
  }

  return { skinTone, hairColor, outfitColor, brightness };
}

/**
 * Renders a Habbo Hotel style isometric pixel avatar onto a 256x256 HTML Canvas.
 */
export function renderHabboPixelAvatar(
  canvas: HTMLCanvasElement,
  options: HabboAvatarOptions = {}
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const size = 256;
  canvas.width = size;
  canvas.height = size;
  ctx.imageSmoothingEnabled = false;

  // Clear background with soft transparent radial gradient
  ctx.clearRect(0, 0, size, size);

  // Background glow circle
  const bgGrad = ctx.createRadialGradient(
    size / 2,
    size / 2 + 10,
    20,
    size / 2,
    size / 2,
    110
  );
  bgGrad.addColorStop(0, "rgba(240, 90, 40, 0.12)");
  bgGrad.addColorStop(1, "rgba(240, 90, 40, 0)");
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 110, 0, Math.PI * 2);
  ctx.fill();

  // Create offscreen 64x64 buffer for pixel art, then scale up crisp
  const buf = document.createElement("canvas");
  buf.width = 64;
  buf.height = 64;
  const bCtx = buf.getContext("2d");
  if (!bCtx) {
    return;
  }
  bCtx.imageSmoothingEnabled = false;

  // Colors
  const skins = {
    fair: { base: "#fbe4d8", shadow: "#e2bfae", highlight: "#fff4ec" },
    medium: { base: "#e8b89d", shadow: "#c8947f", highlight: "#f5cca8" },
    tan: { base: "#c68a68", shadow: "#a0684a", highlight: "#d89c78" },
    deep: { base: "#7a4e32", shadow: "#5a351e", highlight: "#925f3f" },
  };
  const skin = skins[options.skinTone ?? "medium"];

  const hairs = {
    dark: { base: "#27272a", shadow: "#18181b", highlight: "#3f3f46" },
    blonde: { base: "#eab308", shadow: "#ca8a04", highlight: "#fde047" },
    auburn: { base: "#b45309", shadow: "#78350f", highlight: "#d97706" },
    silver: { base: "#94a3b8", shadow: "#64748b", highlight: "#cbd5e1" },
    ember: { base: "#f05a28", shadow: "#c23a0f", highlight: "#ff8c5a" },
  };
  const hair = hairs[options.hairColor ?? "dark"];

  const outfits = {
    ember: { base: "#f05a28", shadow: "#b83d12", highlight: "#ff7a52" },
    cobalt: { base: "#2563eb", shadow: "#1d4ed8", highlight: "#60a5fa" },
    moss: { base: "#16a34a", shadow: "#15803d", highlight: "#4ade80" },
    rose: { base: "#e11d48", shadow: "#be123c", highlight: "#fb7185" },
    amber: { base: "#d97706", shadow: "#b45309", highlight: "#fbbf24" },
    dark: { base: "#27272a", shadow: "#18181b", highlight: "#52525b" },
  };
  const outfit = outfits[options.outfitColor ?? "ember"];

  const BLACK = "#0f172a";
  const WHITE = "#ffffff";

  // Helper pixel drawer on 64x64 canvas
  const p = (x: number, y: number, color: string) => {
    bCtx.fillStyle = color;
    bCtx.fillRect(x, y, 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    bCtx.fillStyle = color;
    bCtx.fillRect(x, y, w, h);
  };

  // Center coordinates (32, 32)
  const cx = 32;
  const cy = 20;

  // Shadow under feet
  bCtx.fillStyle = "rgba(15, 23, 42, 0.25)";
  bCtx.beginPath();
  bCtx.ellipse(cx, cy + 34, 12, 4, 0, 0, Math.PI * 2);
  bCtx.fill();

  // 1. LEGS & SHOES (Isometric 3/4 pose)
  // Shoes (Black 1px outline with dark grey top)
  rect(cx - 7, cy + 30, 5, 3, BLACK);
  rect(cx - 6, cy + 30, 3, 2, "#334155");

  rect(cx + 2, cy + 30, 5, 3, BLACK);
  rect(cx + 3, cy + 30, 3, 2, "#334155");

  // Pants (Dark Charcoal / Denim)
  rect(cx - 6, cy + 20, 5, 10, BLACK);
  rect(cx - 5, cy + 20, 3, 10, "#1e293b");

  rect(cx + 1, cy + 20, 5, 10, BLACK);
  rect(cx + 2, cy + 20, 3, 10, "#334155");

  // 2. TORSO & OUTFIT (Shirt/Hoodie/Suit)
  // Base outline
  rect(cx - 8, cy + 8, 16, 13, BLACK);

  // Shirt fill
  rect(cx - 7, cy + 9, 14, 11, outfit.base);
  rect(cx - 7, cy + 9, 3, 11, outfit.highlight); // Left highlight
  rect(cx + 4, cy + 9, 3, 11, outfit.shadow); // Right shadow

  if (options.outfitStyle === "suit") {
    // White tie & collar
    rect(cx - 1, cy + 9, 2, 8, WHITE);
    rect(cx - 1, cy + 11, 2, 5, BLACK);
  } else if (options.outfitStyle === "hoodie") {
    // Hoodie pocket & strings
    rect(cx - 4, cy + 15, 8, 4, outfit.shadow);
    p(cx - 2, cy + 10, WHITE);
    p(cx + 1, cy + 10, WHITE);
  } else if (options.outfitStyle === "engenty") {
    // Mini Engenty badge on chest
    p(cx - 4, cy + 12, "#f05a28");
    p(cx - 3, cy + 12, "#f05a28");
    p(cx - 4, cy + 13, "#f05a28");
  }

  // Arms
  // Left arm
  rect(cx - 10, cy + 10, 3, 8, BLACK);
  rect(cx - 9, cy + 10, 2, 7, outfit.base);
  rect(cx - 9, cy + 17, 2, 2, skin.base); // Hand

  // Right arm
  rect(cx + 7, cy + 10, 3, 8, BLACK);
  rect(cx + 8, cy + 10, 1, 7, outfit.shadow);
  rect(cx + 7, cy + 17, 2, 2, skin.base); // Hand

  // 3. HEAD & NECK
  // Neck
  rect(cx - 2, cy + 6, 4, 3, BLACK);
  rect(cx - 1, cy + 6, 2, 2, skin.shadow);

  // Head base outline (Habbo isometric box head)
  rect(cx - 8, cy - 8, 16, 15, BLACK);

  // Face skin fill
  rect(cx - 7, cy - 7, 14, 13, skin.base);
  rect(cx - 7, cy - 7, 3, 13, skin.highlight); // Left highlight
  rect(cx + 4, cy - 7, 3, 13, skin.shadow); // Right shadow

  // FACIAL FEATURES (Isometric Habbo face: vertical 2px eyes, L-nose, mouth line)
  // Eyes (vertical 2px dots)
  p(cx - 4, cy - 2, BLACK);
  p(cx - 4, cy - 1, BLACK);

  p(cx + 1, cy - 2, BLACK);
  p(cx + 1, cy - 1, BLACK);

  // Eye glints (1px white top-left)
  p(cx - 5, cy - 2, WHITE);
  p(cx + 0, cy - 2, WHITE);

  // L-Nose
  p(cx - 1, cy + 1, BLACK);
  p(cx, cy + 1, BLACK);

  // Mouth line
  p(cx - 3, cy + 3, BLACK);
  p(cx - 2, cy + 3, BLACK);
  p(cx - 1, cy + 3, BLACK);

  // Glasses option
  if (options.glasses) {
    rect(cx - 6, cy - 3, 4, 3, BLACK);
    rect(cx - 1, cy - 3, 4, 3, BLACK);
    p(cx - 2, cy - 2, BLACK);
    // Lens reflection
    p(cx - 5, cy - 2, "#38bdf8");
    p(cx, cy - 2, "#38bdf8");
  }

  // 4. HAIR (Custom styles: short, wavy, spiky, bob)
  const hairStyle = options.hairStyle ?? "short";

  if (hairStyle === "spiky") {
    rect(cx - 8, cy - 11, 16, 5, BLACK);
    rect(cx - 7, cy - 10, 14, 4, hair.base);
    p(cx - 6, cy - 12, hair.base);
    p(cx - 3, cy - 13, hair.base);
    p(cx, cy - 13, hair.base);
    p(cx + 3, cy - 12, hair.base);
    p(cx - 6, cy - 13, BLACK);
    p(cx - 3, cy - 14, BLACK);
    p(cx, cy - 14, BLACK);
    p(cx + 3, cy - 13, BLACK);
  } else if (hairStyle === "wavy" || hairStyle === "bob") {
    rect(cx - 9, cy - 10, 18, 10, BLACK);
    rect(cx - 8, cy - 9, 16, 9, hair.base);
    rect(cx - 8, cy - 9, 3, 9, hair.highlight);
    rect(cx + 5, cy - 9, 3, 9, hair.shadow);
    // Side bangs
    rect(cx - 8, cy - 2, 3, 7, hair.base);
    rect(cx + 5, cy - 2, 3, 7, hair.shadow);
  } else {
    // Short standard Habbo hair
    rect(cx - 8, cy - 10, 16, 6, BLACK);
    rect(cx - 7, cy - 9, 14, 5, hair.base);
    rect(cx - 7, cy - 9, 3, 5, hair.highlight);
    rect(cx + 4, cy - 9, 3, 5, hair.shadow);
    // Front fringe
    rect(cx - 6, cy - 4, 5, 2, hair.base);
  }

  // Scale up 64x64 crisp to 256x256 on main canvas
  ctx.drawImage(buf, 0, 0, 64, 64, 16, 16, 224, 224);
}
