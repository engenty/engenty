import type { SVGProps } from "react";

/** Decorative SVG inside {@link AnimatedIcon}; label lives on the shell. */
export function AnimatedIconSvg(props: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden focusable="false" role="presentation" {...props} />;
}
