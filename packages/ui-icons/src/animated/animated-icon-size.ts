import type { AnimatedIconSize } from "./types";

const SIZE_PX: Record<AnimatedIconSize, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
};

const SIZE_CLASS: Record<AnimatedIconSize, string> = {
  xs: "size-3.5 shrink-0",
  sm: "size-4 shrink-0",
  md: "size-5 shrink-0",
  lg: "size-6 shrink-0",
};

export function resolveAnimatedIconPixelSize(
  size?: AnimatedIconSize | number
): number {
  if (typeof size === "number") {
    return size;
  }
  return SIZE_PX[size ?? "md"];
}

export function animatedIconSizeClassName(
  size?: AnimatedIconSize | number
): string {
  if (typeof size === "number") {
    return "shrink-0";
  }
  return SIZE_CLASS[size ?? "md"];
}
