// Adapted from https://github.com/pqoqubbw/icons (MIT) — lucide-animated "download"
import type { Variants } from "motion/react";
import { motion } from "motion/react";
import type { Ref } from "react";
import { AnimatedIcon } from "../animated-icon";
import { AnimatedIconSvg } from "../animated-icon-svg";
import type { AnimatedIconBaseProps, AnimatedIconHandle } from "../types";

const ARROW_VARIANTS: Variants = {
  normal: { y: 0 },
  animate: {
    y: 2,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 10,
      mass: 1,
    },
  },
};

export type AnimatedDownloadIconProps = AnimatedIconBaseProps & {
  ref?: Ref<AnimatedIconHandle>;
};

export function AnimatedDownloadIcon({
  ref,
  ...props
}: AnimatedDownloadIconProps) {
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
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <motion.g
            animate={motionDisabled ? "normal" : controls}
            initial="normal"
            variants={ARROW_VARIANTS}
          >
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </motion.g>
        </AnimatedIconSvg>
      )}
    </AnimatedIcon>
  );
}
