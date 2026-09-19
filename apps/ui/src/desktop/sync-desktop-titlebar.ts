/**
 * Match the native macOS title bar to the in-app AppBar (`--sidebar`).
 *
 * WKWebView tints the chrome from `<meta name="theme-color">` (ember orange
 * in index.html). A transparent Tauri title bar plus `setBackgroundColor`
 * paints the same computed rail color into the window chrome.
 */

import { isDesktopShell } from "./desktop-runtime";

export interface RgbaColor {
  alpha: number;
  blue: number;
  green: number;
  red: number;
}

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(value)));
}

function alphaToByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 255;
  }
  return value <= 1 ? clampByte(value * 255) : clampByte(value);
}

/** Parse `rgb()`, `rgba()`, space-separated rgb, or `#rrggbb` into 0–255 channels. */
export function parseCssColorToRgba(css: string): RgbaColor | null {
  const value = css.trim().toLowerCase();
  if (!value || value === "transparent") {
    return null;
  }

  const hex = value.match(/^#([0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1];
    return {
      red: Number.parseInt(digits.slice(0, 2), 16),
      green: Number.parseInt(digits.slice(2, 4), 16),
      blue: Number.parseInt(digits.slice(4, 6), 16),
      alpha: 255,
    };
  }

  const comma = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (comma) {
    return {
      red: clampByte(Number(comma[1])),
      green: clampByte(Number(comma[2])),
      blue: clampByte(Number(comma[3])),
      alpha: comma[4] === undefined ? 255 : alphaToByte(Number(comma[4])),
    };
  }

  const space = value.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/
  );
  if (space) {
    let alpha = 255;
    if (space[4] !== undefined) {
      const raw = space[4];
      alpha = raw.endsWith("%")
        ? clampByte((Number.parseFloat(raw) / 100) * 255)
        : alphaToByte(Number(raw));
    }
    return {
      red: clampByte(Number(space[1])),
      green: clampByte(Number(space[2])),
      blue: clampByte(Number(space[3])),
      alpha,
    };
  }

  return null;
}

export function rgbaToHex({ red, green, blue }: RgbaColor): string {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function applyThemeColorMeta(hex: string): void {
  for (const el of document.querySelectorAll(THEME_COLOR_SELECTOR)) {
    el.setAttribute("content", hex);
  }
}

export function readSidebarColorAsRgba(): RgbaColor | null {
  if (typeof document === "undefined") {
    return null;
  }
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;width:1px;height:1px;pointer-events:none;visibility:hidden;background-color:var(--sidebar)";
  document.documentElement.appendChild(probe);
  const css = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return parseCssColorToRgba(css);
}

let lastAppliedHex: string | null = null;
let raf = 0;

async function paintDesktopTitlebar(): Promise<void> {
  const color = readSidebarColorAsRgba();
  if (!color) {
    return;
  }
  const hex = rgbaToHex(color);
  if (hex === lastAppliedHex) {
    return;
  }
  lastAppliedHex = hex;
  applyThemeColorMeta(hex);
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setBackgroundColor({
      red: color.red,
      green: color.green,
      blue: color.blue,
      alpha: color.alpha,
    });
  } catch (error) {
    console.warn("[desktop] failed to set window background color", error);
  }
}

function schedulePaint(): void {
  if (raf) {
    return;
  }
  raf = window.requestAnimationFrame(() => {
    raf = 0;
    void paintDesktopTitlebar();
  });
}

/** Observe appearance / dark-mode changes and keep the native title bar in sync. */
export function installDesktopTitlebarSync(): void {
  if (!isDesktopShell()) {
    return;
  }
  void paintDesktopTitlebar();
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => void paintDesktopTitlebar(), {
      once: true,
    });
  }
  const observer = new MutationObserver(schedulePaint);
  observer.observe(document.documentElement, {
    attributeFilter: ["class", "style", "data-raw-sidebar"],
    attributes: true,
  });
}
