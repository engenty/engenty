// Adapted from https://github.com/pqoqubbw/icons (MIT) — lucide-animated "check"
import type { Variants } from "motion/react";
import { motion } from "motion/react";
import type { Ref } from "react";
import { AnimatedIcon } from "../animated-icon";
import { AnimatedIconSvg } from "../animated-icon-svg";
import type { AnimatedIconBaseProps, AnimatedIconHandle } from "../types";

const PATH_VARIANTS: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    scale: 1,
    transition: { duration: 0.3, opacity: { duration: 0.1 } },
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    scale: [0.5, 1],
    transition: { duration: 0.4, opacity: { duration: 0.1 } },
  },
};

export type AnimatedCheckIconProps = AnimatedIconBaseProps & {
  ref?: Ref<AnimatedIconHandle>;
};

export function AnimatedCheckIcon({ ref, ...props }: AnimatedCheckIconProps) {
  return (
    <AnimatedIcon ref={ref} {...props}>
      {({ pixelSize, controls, motionDisabled }) => (
        <AnimatedIconSvg
          fill="none"
          height={pixelSize}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={pixelSize}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={motionDisabled ? "normal" : controls}
            d="M4 12 9 17L20 6"
            initial="normal"
            variants={PATH_VARIANTS}
          />
        </AnimatedIconSvg>
      )}
    </AnimatedIcon>
  );
}
