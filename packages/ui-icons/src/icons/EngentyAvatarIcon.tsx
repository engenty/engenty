import type { SVGProps } from "react";

/** Engenty companion avatar — a wobbling blob silhouette with a single eye,
 *  matching the floating copilot avatar. Stroke-based so it sits alongside
 *  lucide icons in menus (inherits `currentColor`). */
export function EngentyAvatarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>Avatar</title>
      <path d="M12 3c4.4 0 7 3 7 7 0 2.5-.8 4.3-2.2 6.6C15.4 18.8 14 21 12 21s-3.4-2.2-4.8-4.4C5.8 14.3 5 12.5 5 10c0-4 2.6-7 7-7Z" />
      <circle cx="12" cy="10" fill="currentColor" r="1.4" stroke="none" />
    </svg>
  );
}
