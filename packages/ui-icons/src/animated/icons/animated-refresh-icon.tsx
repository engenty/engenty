// Adapted from https://github.com/pqoqubbw/icons (MIT) — lucide-animated "refresh-cw"
import { motion } from "motion/react";
import type { Ref } from "react";
import { AnimatedIcon } from "../animated-icon";
import type { AnimatedIconBaseProps, AnimatedIconHandle } from "../types";

export type AnimatedRefreshIconProps = AnimatedIconBaseProps & {
  ref?: Ref<AnimatedIconHandle>;
};

export function AnimatedRefreshIcon({
  ref,
  ...props
}: AnimatedRefreshIconProps) {
  return (
    <AnimatedIcon ref={ref} {...props}>
      {({ pixelSize, controls, motionDisabled }) => (
        <motion.svg
          animate={motionDisabled ? "normal" : controls}
          aria-hidden
          fill="none"
          focusable="false"
          height={pixelSize}
          initial="normal"
          role="presentation"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          transition={{ type: "spring", stiffness: 250, damping: 25 }}
          variants={{
            normal: { rotate: "0deg" },
            animate: { rotate: "50deg" },
          }}
          viewBox="0 0 24 24"
          width={pixelSize}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </motion.svg>
      )}
    </AnimatedIcon>
  );
}
