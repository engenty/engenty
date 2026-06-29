// Adapted from https://github.com/pqoqubbw/icons (MIT) — lucide-animated "copy"
import type { Transition } from "motion/react";
import { motion } from "motion/react";
import type { Ref } from "react";
import { AnimatedIcon } from "../animated-icon";
import { AnimatedIconSvg } from "../animated-icon-svg";
import type { AnimatedIconBaseProps, AnimatedIconHandle } from "../types";

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 160,
  damping: 17,
  mass: 1,
};

const RECT_VARIANTS = {
  normal: { translateY: 0, translateX: 0 },
  animate: { translateY: -3, translateX: -3 },
};

const PATH_VARIANTS = {
  normal: { x: 0, y: 0 },
  animate: { x: 3, y: 3 },
};

export type AnimatedCopyIconProps = AnimatedIconBaseProps & {
  ref?: Ref<AnimatedIconHandle>;
};

export function AnimatedCopyIcon({ ref, ...props }: AnimatedCopyIconProps) {
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
          <motion.rect
            animate={motionDisabled ? "normal" : controls}
            height="14"
            initial="normal"
            rx="2"
            ry="2"
            transition={DEFAULT_TRANSITION}
            variants={RECT_VARIANTS}
            width="14"
            x="8"
            y="8"
          />
          <motion.path
            animate={motionDisabled ? "normal" : controls}
            d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={PATH_VARIANTS}
          />
        </AnimatedIconSvg>
      )}
    </AnimatedIcon>
  );
}
