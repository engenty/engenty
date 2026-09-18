"use client";

import {
  Engenty,
  type EngentyKind,
  EngentyLogoMark,
} from "@engenty/ui-core/components/engenty";

/**
 * Thin client wrappers so server components (pages, layouts) can place the
 * flat engenties without importing the SMIL/gaze code themselves.
 */
export function Mascot({
  animated = true,
  className,
  kind,
  size,
}: {
  animated?: boolean;
  className?: string;
  kind: EngentyKind;
  size: number;
}) {
  return (
    <span aria-hidden="true" className={className}>
      <Engenty animated={animated} kind={kind} size={size} />
    </span>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return <EngentyLogoMark size={size} />;
}
