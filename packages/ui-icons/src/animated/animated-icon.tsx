import type { ReactNode, Ref } from "react";
import { cn } from "../lib/cn";
import {
  animatedIconSizeClassName,
  resolveAnimatedIconPixelSize,
} from "./animated-icon-size";
import type { AnimatedIconBaseProps, AnimatedIconHandle } from "./types";
import { useAnimatedIconMotion } from "./use-animated-icon-motion";

export interface AnimatedIconProps extends AnimatedIconBaseProps {
  children: (ctx: {
    pixelSize: number;
    controls: ReturnType<typeof useAnimatedIconMotion>["controls"];
    motionDisabled: boolean;
  }) => ReactNode;
  ref?: Ref<AnimatedIconHandle>;
}

/**
 * Shared shell for [lucide-animated](https://lucide-animated.com/)–style icons:
 * size tokens, play modes, reduced motion, and imperative handle.
 */
export function AnimatedIcon({
  children,
  className,
  label,
  onMouseEnter,
  onMouseLeave,
  play = "hover",
  ref,
  size,
  ...props
}: AnimatedIconProps) {
  const pixelSize = resolveAnimatedIconPixelSize(size);
  const { controls, motionDisabled, handleMouseEnter, handleMouseLeave } =
    useAnimatedIconMotion(ref, play);

  const shellClassName = cn(
    "inline-flex items-center justify-center text-current",
    animatedIconSizeClassName(size),
    className
  );

  if (label) {
    return (
      <div
        aria-label={label}
        className={shellClassName}
        onMouseEnter={(e) => handleMouseEnter(e, onMouseEnter)}
        onMouseLeave={(e) => handleMouseLeave(e, onMouseLeave)}
        role="img"
        {...props}
      >
        {children({ pixelSize, controls, motionDisabled })}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={shellClassName}
      onMouseEnter={(e) => handleMouseEnter(e, onMouseEnter)}
      onMouseLeave={(e) => handleMouseLeave(e, onMouseLeave)}
      {...props}
    >
      {children({ pixelSize, controls, motionDisabled })}
    </div>
  );
}
